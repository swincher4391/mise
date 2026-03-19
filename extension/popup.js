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
var shareBtn = document.getElementById('share-btn')
var pinBtn = document.getElementById('pin-btn')
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

// --- Vision extraction: video frame grids + transcript → API ---
async function tryVisionExtraction(title, transcriptText) {
  loadingView.querySelector('.status').textContent = 'Capturing video frames...'
  showView(loadingView)

  try {
    // 1. Get the active tab to send message to content script
    var activeTabs = await chrome.tabs.query({ active: true, currentWindow: true })
    var tab = activeTabs[0]

    // 2. Capture frame grids from the video element (36 frames → 4 x 3x3 grids)
    var frameResult = null
    if (tab && tab.id) {
      frameResult = await new Promise(function(resolve) {
        chrome.tabs.sendMessage(tab.id, { type: 'CAPTURE_VIDEO_FRAMES' }, function(resp) {
          if (chrome.runtime.lastError) { resolve(null); return }
          resolve(resp)
        })
      })
    }

    var grids = frameResult && frameResult.grids ? frameResult.grids : null

    // 3. Fallback: single tab screenshot if frame capture failed
    if (!grids) {
      loadingView.querySelector('.status').textContent = 'Capturing screenshot...'
      var capture = await new Promise(function(resolve) {
        chrome.runtime.sendMessage({ type: 'CAPTURE_TAB' }, resolve)
      })
      if (capture && capture.image) {
        grids = [capture.image]
      }
    }

    if (!grids || grids.length === 0) {
      if (transcriptText) { showPasteWithText(title, transcriptText) }
      else { showError('Could not capture video frames.') }
      return
    }

    // 4. Send grids + transcript to Mise vision API
    loadingView.querySelector('.status').textContent = 'Reading recipe from ' + (grids.length > 1 ? grids.length + ' frame grids' : 'video') + '...'

    var body = { images: grids }
    if (transcriptText) body.transcript = transcriptText

    var apiResp = await fetch(MISE_URL + '/api/extract-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!apiResp.ok) {
      if (transcriptText) { showPasteWithText(title, transcriptText) }
      else { showError('Vision API failed. Try the Paste tab.') }
      return
    }

    var data = await apiResp.json()

    if (data.ingredients && data.ingredients.length > 0) {
      var recipe = {
        title: data.title || title || 'Video Recipe',
        sourceUrl: tab ? tab.url : '',
        sourceDomain: 'youtube.com',
        author: null,
        description: null,
        imageUrl: null,
        servings: data.servings ? parseInt(data.servings, 10) || null : null,
        servingsText: data.servings || null,
        prepTimeMinutes: null,
        cookTimeMinutes: null,
        totalTimeMinutes: null,
        rawIngredients: data.ingredients,
        rawSteps: (data.steps || []).map(function(s, i) { return { order: i + 1, text: s } }),
        keywords: [],
        cuisines: [],
        categories: [],
        extractionLayer: 'vision',
      }
      showResult(recipe)
    } else if (transcriptText) {
      showPasteWithText(title, transcriptText)
    } else {
      showError('Could not extract recipe from video. Try the Paste tab.')
    }
  } catch (e) {
    if (transcriptText) { showPasteWithText(title, transcriptText) }
    else { showError('Vision extraction failed: ' + e.message) }
  }
}

function showPasteWithText(title, text) {
  pasteArea.value = (title ? title + '\n\n' : '') + text
  for (var t = 0; t < tabBtns.length; t++) tabBtns[t].classList.remove('active')
  for (var t2 = 0; t2 < tabBtns.length; t2++) {
    if (tabBtns[t2].getAttribute('data-tab') === 'paste') tabBtns[t2].classList.add('active')
  }
  extractTab.classList.add('hidden')
  pasteTab.classList.remove('hidden')
  errorView.classList.remove('hidden')
  errorMsg.textContent = 'Found caption text but could not auto-detect recipe structure. Edit below and click Parse Recipe.'
}

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
      // Caption found but not parseable — try vision on YouTube, else show paste
      var isYT = tab.url && tab.url.includes('youtube.com')
      if (isYT) {
        await tryVisionExtraction(response.title, response.text)
      } else {
        showPasteWithText(response.title, response.text)
      }
    } else if (response && response.type === 'BLOCKED_SITE') {
      showError(response.message)
    } else if (response && response.type === 'NO_RECIPE') {
      // On YouTube, try vision extraction before giving up
      var isYTNoRecipe = tab.url && tab.url.includes('youtube.com')
      if (isYTNoRecipe) {
        await tryVisionExtraction(null, null)
      } else {
        showError('No recipe found on this page. Try the Paste tab to paste recipe text directly.')
      }
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
// Share & Pin — builds compressed Mise share URL (api/r?d=...)
// =========================================================================

var SHARE_BASE = MISE_URL + '/api/r'

function buildSharePayload(recipe) {
  var payload = {
    t: recipe.title || 'Untitled Recipe',
    ig: recipe.rawIngredients || [],
    st: (recipe.rawSteps || []).map(function(s) { return typeof s === 'string' ? s : s.text }),
  }
  if (recipe.author) payload.a = recipe.author
  if (recipe.description) payload.d = recipe.description
  if (recipe.imageUrl) payload.img = recipe.imageUrl
  if (recipe.servings) payload.sv = recipe.servings
  if (recipe.sourceUrl) payload.src = recipe.sourceUrl
  if (recipe.keywords && recipe.keywords.length) payload.kw = recipe.keywords
  if (recipe.cuisines && recipe.cuisines.length) payload.cu = recipe.cuisines
  if (recipe.categories && recipe.categories.length) payload.cat = recipe.categories
  return payload
}

async function compressPayload(payload) {
  var json = JSON.stringify(payload)
  var bytes = new TextEncoder().encode(json)

  var cs = new CompressionStream('gzip')
  var writer = cs.writable.getWriter()
  writer.write(bytes)
  writer.close()

  var chunks = []
  var reader = cs.readable.getReader()
  while (true) {
    var result = await reader.read()
    if (result.done) break
    chunks.push(result.value)
  }

  var totalLen = 0
  for (var i = 0; i < chunks.length; i++) totalLen += chunks[i].length
  var compressed = new Uint8Array(totalLen)
  var offset = 0
  for (var j = 0; j < chunks.length; j++) {
    compressed.set(chunks[j], offset)
    offset += chunks[j].length
  }

  // base64url encode (no padding)
  var chunkSize = 8192
  var binaryStr = ''
  for (var k = 0; k < compressed.length; k += chunkSize) {
    var slice = compressed.subarray(k, Math.min(k + chunkSize, compressed.length))
    binaryStr += String.fromCharCode.apply(null, Array.from(slice))
  }
  var base64 = btoa(binaryStr)
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function buildMiseShareUrl(recipe) {
  var payload = buildSharePayload(recipe)
  var encoded = await compressPayload(payload)
  var url = SHARE_BASE + '?d=' + encoded

  // Strip fields if URL too long (>6000 chars)
  if (url.length > 6000 && payload.d) {
    delete payload.d
    encoded = await compressPayload(payload)
    url = SHARE_BASE + '?d=' + encoded
  }
  if (url.length > 6000 && payload.img) {
    delete payload.img
    encoded = await compressPayload(payload)
    url = SHARE_BASE + '?d=' + encoded
  }
  return url
}

// --- Share button: copy Mise link to clipboard ---
shareBtn.addEventListener('click', async function() {
  if (!currentRecipe) return
  shareBtn.textContent = 'Building...'
  shareBtn.disabled = true
  try {
    var url = await buildMiseShareUrl(currentRecipe)
    await navigator.clipboard.writeText(url)
    shareBtn.textContent = 'Copied!'
    setTimeout(function() { shareBtn.textContent = 'Share'; shareBtn.disabled = false }, 2000)
  } catch (e) {
    shareBtn.textContent = 'Failed'
    setTimeout(function() { shareBtn.textContent = 'Share'; shareBtn.disabled = false }, 2000)
  }
})

// --- Pin to Pinterest button ---
pinBtn.addEventListener('click', async function() {
  if (!currentRecipe) return
  pinBtn.textContent = 'Building...'
  pinBtn.disabled = true
  try {
    var miseUrl = await buildMiseShareUrl(currentRecipe)
    var pinUrl = 'https://pinterest.com/pin/create/button/?'
      + 'url=' + encodeURIComponent(miseUrl)
      + '&description=' + encodeURIComponent(currentRecipe.title || 'Recipe')
    if (currentRecipe.imageUrl) {
      pinUrl += '&media=' + encodeURIComponent(currentRecipe.imageUrl)
    }
    chrome.tabs.create({ url: pinUrl })
    pinBtn.textContent = 'Pin to Pinterest'
    pinBtn.disabled = false
  } catch (e) {
    pinBtn.textContent = 'Failed'
    setTimeout(function() { pinBtn.textContent = 'Pin to Pinterest'; pinBtn.disabled = false }, 2000)
  }
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
