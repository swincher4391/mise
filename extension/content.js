/* eslint-disable no-undef */

/**
 * Mise Extension Content Script v2.0
 *
 * Extraction layers: JSON-LD -> Microdata -> Heuristic
 * Also handles: recipe auto-detection (badge), blocked site detection
 */

// =========================================================================
// Blocked sites that don't work with extension extraction
// =========================================================================

var BLOCKED_DOMAINS = [
  'allrecipes.com', 'foodnetwork.com', 'food.com',
  'cookinglight.com', 'eatingwell.com', 'myrecipes.com',
  'southernliving.com', 'thekitchn.com',
]

function isBlockedSite() {
  var host = window.location.hostname.toLowerCase()
  return BLOCKED_DOMAINS.some(function(d) { return host === d || host.endsWith('.' + d) })
}

// =========================================================================
// Layer 1: JSON-LD extraction
// =========================================================================

function isRecipeType(type) {
  if (typeof type === 'string') return type === 'Recipe' || type.endsWith('/Recipe')
  if (Array.isArray(type)) return type.some(function(t) { return typeof t === 'string' && (t === 'Recipe' || t.endsWith('/Recipe')) })
  return false
}

function findRecipesInObject(obj) {
  var recipes = []
  if (!obj || typeof obj !== 'object') return recipes
  if (isRecipeType(obj['@type'])) { recipes.push(obj); return recipes }
  if (Array.isArray(obj['@graph'])) {
    for (var i = 0; i < obj['@graph'].length; i++) {
      var found = findRecipesInObject(obj['@graph'][i])
      for (var j = 0; j < found.length; j++) recipes.push(found[j])
    }
    return recipes
  }
  if (Array.isArray(obj)) {
    for (var k = 0; k < obj.length; k++) {
      var f = findRecipesInObject(obj[k])
      for (var l = 0; l < f.length; l++) recipes.push(f[l])
    }
  }
  return recipes
}

function extractJsonLd(html) {
  var recipes = []
  var re = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  var m
  while ((m = re.exec(html)) !== null) {
    try { var found = findRecipesInObject(JSON.parse(m[1].trim())); for (var i = 0; i < found.length; i++) recipes.push(found[i]) } catch (e) { /* skip */ }
  }
  return recipes
}

// =========================================================================
// Layer 2: Microdata extraction
// =========================================================================

var ARRAY_PROPS = { recipeIngredient: 1, ingredients: 1, recipeInstructions: 1, step: 1 }

function getPropertyValue(el) {
  var tag = el.tagName.toLowerCase()
  if (tag === 'meta') return el.getAttribute('content') || ''
  if (tag === 'img') return el.getAttribute('src') || el.getAttribute('content') || ''
  if (tag === 'a' || tag === 'link') return el.getAttribute('href') || ''
  if (tag === 'time') return el.getAttribute('datetime') || (el.textContent || '').trim()
  if (tag === 'data') return el.getAttribute('value') || (el.textContent || '').trim()
  return (el.textContent || '').trim()
}

function addValue(obj, key, value) {
  if (ARRAY_PROPS[key]) {
    if (!Array.isArray(obj[key])) obj[key] = obj[key] != null ? [obj[key]] : []
    obj[key].push(value)
  } else if (key in obj) {
    if (!Array.isArray(obj[key])) obj[key] = [obj[key]]
    obj[key].push(value)
  } else {
    obj[key] = value
  }
}

function extractItemScope(root) {
  var result = {}
  var processed = new Set()
  function walk(parent) {
    for (var i = 0; i < parent.children.length; i++) {
      var child = parent.children[i]
      if (processed.has(child)) continue
      var prop = child.getAttribute('itemprop')
      var isScope = child.hasAttribute('itemscope')
      if (prop) {
        processed.add(child)
        if (isScope) {
          var nested = extractItemScope(child)
          var t = child.getAttribute('itemtype')
          if (t) nested['@type'] = t.split('/').pop() || ''
          addValue(result, prop, nested)
        } else {
          addValue(result, prop, getPropertyValue(child))
        }
      } else if (!isScope) { walk(child) }
    }
  }
  walk(root)
  return result
}

function extractMicrodata(html) {
  var parser = new DOMParser()
  var doc = parser.parseFromString(html, 'text/html')
  var els = doc.querySelectorAll('[itemtype*="schema.org/Recipe"]')
  if (els.length === 0) return []
  var recipes = []
  for (var i = 0; i < els.length; i++) {
    var r = extractItemScope(els[i])
    r['@type'] = 'Recipe'
    recipes.push(r)
  }
  return recipes
}

// =========================================================================
// Layer 3: Heuristic extraction
// =========================================================================

var INGREDIENT_HEADING = /^(?:\u{1F6D2}\s*)?ingredients/iu
var INSTRUCTION_HEADING = /^(?:\u{1F469}\u200D\u{1F373}\s*)?(?:instructions|directions|steps|method|preparation|how\s+to\s+make)/iu
var STOP_HEADING = /^(?:\u{1F37D}\s*)?(?:notes?|tips?|serving|variations?|nutrition|storage|faq|related|you\s+may|final\s+thoughts|comments?|leave\s+a|rate\s+this|print|similar|more\s+recipes|post\s+navigation|latest\s+posts)/iu

function isAdScript(text) {
  return /ezstandalone|ezoic|adsbygoogle|googletag|__cmp/i.test(text)
}

function cleanText(el) { return (el.textContent || '').trim() }
function stripHtml(html) { return html.replace(/<[^>]*>/g, '').trim() }

function isStopElement(el, sectionHeading) {
  var tag = el.tagName
  if (!tag || !/^H[1-4]$/.test(tag)) return false
  var sectionLevel = parseInt(sectionHeading.tagName[1])
  var elLevel = parseInt(tag[1])
  if (elLevel <= sectionLevel) return true
  return STOP_HEADING.test(cleanText(el))
}

function extractIngredientsList(heading) {
  var ingredients = []
  var el = heading.nextElementSibling
  while (el) {
    if (isStopElement(el, heading)) break
    if (el.tagName === 'UL' || el.tagName === 'OL') {
      var items = el.querySelectorAll(':scope > li')
      for (var i = 0; i < items.length; i++) {
        var text = cleanText(items[i])
        if (text && !isAdScript(text)) ingredients.push(text)
      }
    }
    el = el.nextElementSibling
  }
  return ingredients
}

function extractStepsList(heading) {
  var steps = []
  var el = heading.nextElementSibling
  var pendingSub = ''
  while (el) {
    if (isStopElement(el, heading)) break
    var tag = el.tagName
    var text = cleanText(el)
    if (tag === 'H3' || tag === 'H4') {
      pendingSub = (text || '').replace(/^\d+\.\s*/, '')
    } else if (tag === 'P' && text && !isAdScript(text)) {
      var lines = el.innerHTML.split(/<br\s*\/?>/i).map(function(f) { return stripHtml(f).trim() }).filter(Boolean)
      for (var i = 0; i < lines.length; i++) {
        if (isAdScript(lines[i])) continue
        steps.push(pendingSub ? pendingSub + ': ' + lines[i] : lines[i])
        pendingSub = ''
      }
    } else if (tag === 'OL' || tag === 'UL') {
      var lis = el.querySelectorAll(':scope > li')
      for (var j = 0; j < lis.length; j++) {
        var t = cleanText(lis[j])
        if (t && !isAdScript(t)) {
          steps.push(pendingSub ? pendingSub + ': ' + t : t)
          pendingSub = ''
        }
      }
    }
    el = el.nextElementSibling
  }
  return steps
}

function extractHeuristic() {
  var headings = document.querySelectorAll('h1, h2, h3, h4')
  var ingredientH = null, instructionH = null
  for (var i = 0; i < headings.length; i++) {
    var text = cleanText(headings[i])
    if (!ingredientH && INGREDIENT_HEADING.test(text)) ingredientH = headings[i]
    else if (!instructionH && INSTRUCTION_HEADING.test(text)) instructionH = headings[i]
    if (ingredientH && instructionH) break
  }
  if (!ingredientH && !instructionH) return null

  var ingredients = ingredientH ? extractIngredientsList(ingredientH) : []
  var steps = instructionH ? extractStepsList(instructionH) : []
  if (ingredients.length === 0 && steps.length === 0) return null

  var h1 = document.querySelector('h1')
  var titleEl = document.querySelector('title')
  var title = (h1 ? h1.textContent.trim() : null)
    || (titleEl ? titleEl.textContent.trim().replace(/\s*[|\u2013\u2014-]\s*.+$/, '') : null)
    || 'Untitled Recipe'
  var ogMeta = document.querySelector('meta[property="og:image"]')
  var ogImage = ogMeta ? ogMeta.getAttribute('content') : null

  return {
    '@type': 'Recipe',
    name: title,
    image: ogImage,
    recipeIngredient: ingredients,
    recipeInstructions: steps.map(function(text) { return { '@type': 'HowToStep', text: text } }),
  }
}

// =========================================================================
// Quick recipe detection (for badge)
// =========================================================================

function hasRecipeOnPage() {
  var html = document.documentElement.outerHTML
  if (/"@type"\s*:\s*"Recipe"/i.test(html)) return true
  if (document.querySelector('[itemtype*="schema.org/Recipe"]')) return true
  var headings = document.querySelectorAll('h1, h2, h3, h4')
  var hasIng = false, hasStep = false
  for (var i = 0; i < headings.length; i++) {
    var t = (headings[i].textContent || '').trim()
    if (INGREDIENT_HEADING.test(t)) hasIng = true
    if (INSTRUCTION_HEADING.test(t)) hasStep = true
    if (hasIng && hasStep) return true
  }
  return false
}

// =========================================================================
// Normalizer
// =========================================================================

function normalizeForExtension(raw, url) {
  var title = raw.name || raw.headline || 'Untitled Recipe'
  var sourceDomain = ''
  try { sourceDomain = new URL(url).hostname.replace(/^www\./, '') } catch (e) { /* */ }

  var author = null
  if (raw.author) {
    if (typeof raw.author === 'string') author = raw.author
    else if (raw.author.name) author = raw.author.name
    else if (Array.isArray(raw.author) && raw.author[0] && raw.author[0].name) author = raw.author[0].name
  }

  var imageUrl = null
  if (raw.image) {
    if (typeof raw.image === 'string') imageUrl = raw.image
    else if (raw.image.url) imageUrl = raw.image.url
    else if (Array.isArray(raw.image) && raw.image[0]) {
      imageUrl = typeof raw.image[0] === 'string' ? raw.image[0] : (raw.image[0].url || null)
    }
  }

  var ingredients = []
  var rawIngs = raw.recipeIngredient || raw.ingredients || []
  for (var i = 0; i < rawIngs.length; i++) {
    if (typeof rawIngs[i] === 'string') ingredients.push(rawIngs[i].trim())
  }

  var steps = []
  var rawSteps = raw.recipeInstructions || []
  if (typeof rawSteps === 'string') {
    rawSteps.split(/\n+/).forEach(function(s, i) { var t = s.trim(); if (t) steps.push({ order: i + 1, text: t }) })
  } else if (Array.isArray(rawSteps)) {
    rawSteps.forEach(function(s, i) {
      if (typeof s === 'string') steps.push({ order: i + 1, text: s.trim() })
      else if (s && s.text) steps.push({ order: i + 1, text: s.text.trim() })
    })
  }

  var yieldText = raw.recipeYield ? (Array.isArray(raw.recipeYield) ? raw.recipeYield[0] : raw.recipeYield) : null
  var servings = null
  if (yieldText) { var m = String(yieldText).match(/(\d+)/); if (m) servings = parseInt(m[1], 10) }

  return {
    title: title, sourceUrl: url, sourceDomain: sourceDomain, author: author,
    description: raw.description || null,
    imageUrl: imageUrl, servings: servings, servingsText: yieldText,
    prepTimeMinutes: null, cookTimeMinutes: null, totalTimeMinutes: null,
    rawIngredients: ingredients, rawSteps: steps,
    keywords: raw.keywords ? (typeof raw.keywords === 'string' ? raw.keywords.split(',').map(function(k) { return k.trim() }) : raw.keywords) : [],
    cuisines: raw.recipeCuisine ? (typeof raw.recipeCuisine === 'string' ? [raw.recipeCuisine] : raw.recipeCuisine) : [],
    categories: raw.recipeCategory ? (typeof raw.recipeCategory === 'string' ? [raw.recipeCategory] : raw.recipeCategory) : [],
    extractionLayer: 'json-ld',
  }
}

// =========================================================================
// Message listener
// =========================================================================

chrome.runtime.onMessage.addListener(function(message, _sender, sendResponse) {
  if (message.type === 'DETECT_RECIPE') {
    sendResponse({ hasRecipe: hasRecipeOnPage() })
    return true
  }

  if (message.type !== 'EXTRACT_RECIPE') return false

  if (isBlockedSite()) {
    var host = window.location.hostname.replace(/^www\./, '')
    sendResponse({
      type: 'BLOCKED_SITE',
      domain: host,
      message: host + ' blocks automated extraction. Try Paste mode or Photo import in the Mise app.',
    })
    return true
  }

  try {
    var html = document.documentElement.outerHTML
    var url = window.location.href

    var recipes = extractJsonLd(html)
    var layer = 'json-ld'

    if (recipes.length === 0) {
      recipes = extractMicrodata(html)
      layer = 'microdata'
    }

    if (recipes.length === 0) {
      var heuristic = extractHeuristic()
      if (heuristic) { recipes = [heuristic]; layer = 'heuristic' }
    }

    if (recipes.length > 0) {
      var normalized = normalizeForExtension(recipes[0], url)
      normalized.extractionLayer = layer
      sendResponse({ type: 'RECIPE_DATA', recipe: normalized })
    } else {
      sendResponse({ type: 'NO_RECIPE' })
    }
  } catch (e) {
    sendResponse({ type: 'NO_RECIPE' })
  }

  return true
})
