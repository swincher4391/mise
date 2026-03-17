/* eslint-disable no-undef */

/**
 * Mise Extension Popup v2.0
 *
 * Features: Extract, Paste mode, Nutrition preview,
 * Parsed ingredient list, Serving scaler, Blocked site handling
 */

var MISE_URL = 'https://mise.swinch.dev'
var MN = window.MiseNutrition

// --- DOM refs ---
var extractTab = document.getElementById('extract-tab')
var pasteTab = document.getElementById('paste-tab')
var extractView = document.getElementById('extract-view')
var loadingView = document.getElementById('loading-view')
var resultView = document.getElementById('result-view')
var errorView = document.getElementById('error-view')

var extractBtn = document.getElementById('extract-btn')
var pasteBtn = document.getElementById('paste-btn')
var pasteArea = document.getElementById('paste-area')
var openBtn = document.getElementById('open-btn')
var saveBtn = document.getElementById('save-btn')
var retryBtn = document.getElementById('retry-btn')
var recipeTitleEl = document.getElementById('recipe-title')
var recipeMetaEl = document.getElementById('recipe-meta')
var errorMsg = document.getElementById('error-msg')

var nutritionPreview = document.getElementById('nutrition-preview')
var nCal = document.getElementById('n-cal')
var nProt = document.getElementById('n-prot')
var nFat = document.getElementById('n-fat')
var nCarbs = document.getElementById('n-carbs')
var nFiber = document.getElementById('n-fiber')

var serveMinus = document.getElementById('serve-minus')
var servePlus = document.getElementById('serve-plus')
var serveCount = document.getElementById('serve-count')

var toggleIngredientsBtn = document.getElementById('toggle-ingredients')
var ingredientListEl = document.getElementById('ingredient-list')

var currentRecipe = null
var currentServings = 4
var originalServings = 4

// --- Tab switching ---
var tabBtns = document.querySelectorAll('.tab')
for (var i = 0; i < tabBtns.length; i++) {
  tabBtns[i].addEventListener('click', function() {
    for (var j = 0; j < tabBtns.length; j++) tabBtns[j].classList.remove('active')
    this.classList.add('active')
    var target = this.getAttribute('data-tab')
    extractTab.classList.toggle('hidden', target !== 'extract')
    pasteTab.classList.toggle('hidden', target !== 'paste')
    resultView.classList.add('hidden')
    errorView.classList.add('hidden')
  })
}

// --- View management ---
function showView(view) {
  extractView.classList.add('hidden')
  loadingView.classList.add('hidden')
  resultView.classList.add('hidden')
  errorView.classList.add('hidden')
  pasteTab.classList.add('hidden')
  extractTab.classList.add('hidden')
  view.classList.remove('hidden')
}

function showError(message) {
  errorMsg.textContent = message
  resultView.classList.add('hidden')
  errorView.classList.remove('hidden')
}

function escapeText(str) {
  var div = document.createElement('div')
  div.textContent = str
  return div.textContent
}

function showResult(recipe) {
  currentRecipe = recipe
  originalServings = recipe.servings || 4
  currentServings = originalServings
  serveCount.textContent = currentServings

  recipeTitleEl.textContent = recipe.title || 'Untitled Recipe'

  // Meta badges - build with DOM methods
  while (recipeMetaEl.firstChild) recipeMetaEl.removeChild(recipeMetaEl.firstChild)
  var metaParts = []
  if (recipe.sourceDomain) metaParts.push(recipe.sourceDomain)
  if (recipe.extractionLayer) metaParts.push(recipe.extractionLayer)
  if (recipe.rawIngredients) metaParts.push(recipe.rawIngredients.length + ' ingredients')
  if (recipe.rawSteps) metaParts.push(recipe.rawSteps.length + ' steps')
  for (var i = 0; i < metaParts.length; i++) {
    var span = document.createElement('span')
    span.textContent = metaParts[i]
    recipeMetaEl.appendChild(span)
  }

  renderIngredients()
  updateNutrition()

  saveBtn.textContent = 'Save to Mise'
  saveBtn.disabled = false

  loadingView.classList.add('hidden')
  extractView.classList.add('hidden')
  errorView.classList.add('hidden')
  resultView.classList.remove('hidden')
}

// --- Ingredient rendering ---
function renderIngredients() {
  if (!currentRecipe || !currentRecipe.rawIngredients) return

  while (ingredientListEl.firstChild) ingredientListEl.removeChild(ingredientListEl.firstChild)

  for (var i = 0; i < currentRecipe.rawIngredients.length; i++) {
    var raw = currentRecipe.rawIngredients[i]
    var parsed = MN.parseIngredientLine(raw)
    var scaledQty = parsed.qty !== null
      ? MN.scaleQuantity(parsed.qty, originalServings, currentServings)
      : null

    var qtyStr = ''
    if (scaledQty !== null) {
      qtyStr = formatQty(scaledQty)
      if (parsed.unitCanonical) qtyStr += ' ' + parsed.unitCanonical
    }

    var row = document.createElement('div')
    row.className = 'ingredient-item'

    var qtySpan = document.createElement('span')
    qtySpan.className = 'ing-qty'
    qtySpan.textContent = qtyStr
    row.appendChild(qtySpan)

    var nameSpan = document.createElement('span')
    nameSpan.className = 'ing-name'
    nameSpan.textContent = parsed.ingredient
    row.appendChild(nameSpan)

    if (parsed.prep) {
      var prepSpan = document.createElement('span')
      prepSpan.className = 'ing-prep'
      prepSpan.textContent = ', ' + parsed.prep
      row.appendChild(prepSpan)
    }

    ingredientListEl.appendChild(row)
  }
}

function formatQty(n) {
  if (n === null || n === undefined) return ''
  if (n === Math.floor(n)) return String(n)
  var frac = n % 1
  var whole = Math.floor(n)
  var fracs = { 0.25: '\u00BC', 0.33: '\u2153', 0.5: '\u00BD', 0.67: '\u2154', 0.75: '\u00BE' }
  var closest = null
  var minDist = 0.1
  for (var key in fracs) {
    var dist = Math.abs(frac - parseFloat(key))
    if (dist < minDist) { minDist = dist; closest = fracs[key] }
  }
  if (closest) return (whole > 0 ? whole + ' ' : '') + closest
  return n.toFixed(1)
}

// --- Nutrition ---
function updateNutrition() {
  if (!currentRecipe || !currentRecipe.rawIngredients || currentRecipe.rawIngredients.length === 0) {
    nutritionPreview.classList.add('hidden')
    return
  }

  var result = MN.estimateRecipeNutrition(currentRecipe.rawIngredients, currentServings)
  if (result.matched === 0) {
    nutritionPreview.classList.add('hidden')
    return
  }

  var ps = result.perServing
  nCal.textContent = '~' + Math.round(ps.calories)
  nProt.textContent = ps.protein.toFixed(1) + 'g'
  nFat.textContent = ps.fat.toFixed(1) + 'g'
  nCarbs.textContent = ps.carbs.toFixed(1) + 'g'
  nFiber.textContent = ps.fiber.toFixed(1) + 'g'
  nutritionPreview.classList.remove('hidden')
}

// --- Serving scaler ---
serveMinus.addEventListener('click', function() {
  if (currentServings > 1) {
    currentServings--
    serveCount.textContent = currentServings
    renderIngredients()
    updateNutrition()
  }
})

servePlus.addEventListener('click', function() {
  currentServings++
  serveCount.textContent = currentServings
  renderIngredients()
  updateNutrition()
})

// --- Ingredient list toggle ---
toggleIngredientsBtn.addEventListener('click', function() {
  var isHidden = ingredientListEl.classList.toggle('hidden')
  toggleIngredientsBtn.textContent = isHidden ? 'Show ingredients' : 'Hide ingredients'
})

// --- Extract button ---
extractBtn.addEventListener('click', async function() {
  showView(loadingView)

  try {
    var activeTabs = await chrome.tabs.query({ active: true, currentWindow: true })
    var tab = activeTabs[0]
    if (!tab || !tab.id) { showError('No active tab found.'); return }

    var response = await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_RECIPE' })

    if (response && response.type === 'RECIPE_DATA' && response.recipe) {
      showResult(response.recipe)
    } else if (response && response.type === 'SOCIAL_TEXT') {
      // Found caption text but couldn't auto-parse — switch to Paste tab with text pre-filled
      pasteArea.value = (response.title ? response.title + '\n\n' : '') + response.text
      for (var t = 0; t < tabBtns.length; t++) tabBtns[t].classList.remove('active')
      for (var t2 = 0; t2 < tabBtns.length; t2++) { if (tabBtns[t2].getAttribute('data-tab') === 'paste') tabBtns[t2].classList.add('active') }
      extractTab.classList.add('hidden')
      pasteTab.classList.remove('hidden')
      errorView.classList.remove('hidden')
      errorMsg.textContent = 'Found caption text but could not auto-detect recipe structure. Edit below and click Parse Recipe.'
    } else if (response && response.type === 'BLOCKED_SITE') {
      showError(response.message)
    } else if (response && response.type === 'NO_RECIPE') {
      showError('No recipe found on this page. Try the Paste tab to paste recipe text directly.')
    } else {
      showError('Could not communicate with page. Try refreshing.')
    }
  } catch (err) {
    showError('Failed to extract recipe. Try refreshing the page.')
  }
})

// --- Paste button ---
pasteBtn.addEventListener('click', function() {
  var text = pasteArea.value.trim()
  if (!text) return

  var parsed = parseTextRecipe(text)
  if (parsed.ingredientLines.length === 0 && parsed.stepLines.length === 0) {
    showError('Could not find ingredients or steps in the pasted text.')
    return
  }

  var recipe = {
    title: parsed.title || 'Pasted Recipe',
    sourceUrl: '',
    sourceDomain: '',
    author: null,
    description: null,
    imageUrl: null,
    servings: null,
    servingsText: null,
    prepTimeMinutes: null,
    cookTimeMinutes: null,
    totalTimeMinutes: null,
    rawIngredients: parsed.ingredientLines,
    rawSteps: parsed.stepLines.map(function(s, i) { return { order: i + 1, text: s } }),
    keywords: [],
    cuisines: [],
    categories: [],
    extractionLayer: 'text',
  }

  showResult(recipe)
})

// --- Open / Save buttons ---
openBtn.addEventListener('click', function() {
  if (!currentRecipe) return
  try {
    var channel = new BroadcastChannel('mise-recipe-import')
    channel.postMessage({ type: 'IMPORT_RECIPE', recipe: currentRecipe })
    channel.close()
  } catch (e) { /* ignore */ }
  var payload = btoa(unescape(encodeURIComponent(JSON.stringify(currentRecipe))))
  chrome.tabs.create({ url: MISE_URL + '#import=' + payload })
  window.close()
})

saveBtn.addEventListener('click', function() {
  if (!currentRecipe) return
  try {
    var channel = new BroadcastChannel('mise-recipe-import')
    channel.postMessage({ type: 'IMPORT_RECIPE', recipe: currentRecipe })
    channel.close()
    saveBtn.textContent = 'Sent!'
    saveBtn.disabled = true
  } catch (e) {
    var payload = btoa(unescape(encodeURIComponent(JSON.stringify(currentRecipe))))
    chrome.tabs.create({ url: MISE_URL + '#import=' + payload })
    window.close()
  }
})

retryBtn.addEventListener('click', function() {
  errorView.classList.add('hidden')
  extractView.classList.remove('hidden')
})

// =========================================================================
// Inline text recipe parser (ported from parseTextRecipe.ts)
// =========================================================================

var COOKING_VERBS_RE = /\b(cook|bake|roast|grill|saut[e\u00e9]|fry|simmer|boil|steam|broil|braise|brown|stir|mix|combine|whisk|fold|blend|chop|dice|slice|mince|peel|drain|heat|preheat|melt|pour|add|toss|season|marinate|spread|serve|refrigerat|chill|freeze|let\s+sit|set\s+aside|bring\s+to|stir\s+in|fold\s+in|top\s+with|remove\s+from|place\s+in|transfer|arrange)\b/i

var QTY_UNIT_RE = /^[\d\u00bd\u00bc\u00be\u2153\u2154][\d\/.\u00bd\u00bc\u00be\u2153\u2154-]*\s*(?:cups?|tbsps?|tsps?|tbs|tbl|tablespoons?|teaspoons?|oz|ounces?|lbs?|pounds?|g|grams?|gm|kg|kgs?|ml|mls?|liters?|litres?|pints?|quarts?|gallons?|fl\s*oz|pinch(?:es)?|dash(?:es)?|handfuls?|cloves?|bunch(?:es)?|sprigs?|stalks?|cans?|heads?|packages?|pkg|sticks?|pieces?|pcs?|slices?|bags?|bottles?|jars?|boxes?|drops?)\b/i

function isLikelyIngredient(line) {
  if (QTY_UNIT_RE.test(line)) return true
  if (/^[\d\u00bd\u00bc\u00be\u2153\u2154][\d\/.\u00bd\u00bc\u00be\u2153\u2154-]+\s+[a-z]/i.test(line) && !COOKING_VERBS_RE.test(line) && line.length < 60) return true
  if (/^\d+\s+[a-z]/i.test(line) && !COOKING_VERBS_RE.test(line) && line.length < 60) return true
  if (/\b(to\s+taste|(?:to|for)\s+garnish(?:ing)?|as\s+needed)\b/i.test(line) && line.length < 80) return true
  return false
}

function parseTextRecipe(text) {
  var lines = text.split('\n').filter(function(l) { return l.trim() })
  if (lines.length === 0) return { title: '', ingredientLines: [], stepLines: [] }

  var firstLower = lines[0].toLowerCase().trim()
  var firstIsHeader = /^(=\s*)?(ingredients|grocery\s*list|instructions|steps|directions|method)\b/i.test(firstLower)

  var title, startIndex
  if (firstIsHeader) {
    title = 'Pasted Recipe'
    startIndex = 0
  } else {
    title = lines[0].replace(/^[<\u00ae=\-[\]0-9.]+\s*/, '').replace(/^Title:\s*/i, '').trim()
    startIndex = 1
  }

  var ingredientLines = []
  var stepLines = []
  var section = 'unknown'

  for (var idx = startIndex; idx < lines.length; idx++) {
    var line = lines[idx]
    var lower = line.toLowerCase().trim()

    if (/^(=\s*)?(ingredients|grocery\s*list)\b/i.test(lower)) { section = 'ingredients'; continue }
    if (/^(instructions|steps|directions|method)\b/i.test(lower)) { section = 'steps'; continue }
    if (/^[\u00ae<>[\]]+/.test(line.trim())) continue

    var cleaned = line.replace(/^[-*\u2022]\s*/, '').replace(/^\d+\.\s*/, '').trim()
    if (!cleaned) continue

    var isNumbered = /^\d+\.\s/.test(line.trim())

    if (section === 'ingredients') {
      ingredientLines.push(cleaned)
    } else if (section === 'steps') {
      stepLines.push(cleaned)
    } else {
      if (/^[-*\u2022]\s/.test(line.trim()) || isLikelyIngredient(cleaned)) {
        ingredientLines.push(cleaned)
      } else if (isNumbered) {
        stepLines.push(cleaned)
      } else if (cleaned.length > 20 && COOKING_VERBS_RE.test(cleaned)) {
        stepLines.push(cleaned)
      }
    }
  }

  return { title: title, ingredientLines: ingredientLines, stepLines: stepLines }
}
