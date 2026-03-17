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
  // Social media pages may have recipes in captions
  if (isSocialMediaPage()) return true
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
// Layer 4: Social media caption extraction (DOM-based)
// The extension runs IN the user's browser, so we read the rendered DOM
// directly — no proxy needed, no blocked requests.
// =========================================================================

function isSocialMediaPage() {
  var host = window.location.hostname.toLowerCase()
  return host.includes('instagram.com') || host.includes('tiktok.com') ||
    host.includes('youtube.com') || host.includes('facebook.com')
}

function decodeJsonString(str) {
  return str
    .replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\r/g, '\r')
    .replace(/\\u([0-9a-fA-F]{4})/g, function(_, hex) { return String.fromCodePoint(parseInt(hex, 16)) })
    .replace(/\\"/g, '"').replace(/\\\//g, '/').replace(/\\\\/g, '\\')
}

function decodeEntities(text) {
  return text
    .replace(/&#x([0-9a-f]+);/gi, function(_, hex) { return String.fromCodePoint(parseInt(hex, 16)) })
    .replace(/&#(\d+);/g, function(_, dec) { return String.fromCodePoint(parseInt(dec, 10)) })
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#39;/g, "'")
    .replace(/&ndash;/g, '\u2013').replace(/&mdash;/g, '\u2014')
    .replace(/&frac12;/g, '\u00BD').replace(/&frac14;/g, '\u00BC').replace(/&frac34;/g, '\u00BE')
    .replace(/&deg;/g, '\u00B0')
}

function cleanSocialCaption(text) {
  return text
    .replace(/#\w+/g, '')
    .replace(/\bcomment\s+\w+\s+and\s+I['\u2019]ll\b.*$/gim, '')
    .replace(/\bcomment\s+\w+\b.*send\b.*$/gim, '')
    .replace(/^follow\s+(for|me|us)\b.*$/gim, '')
    .replace(/[\u{1D400}-\u{1D7FF}]+/gu, '')
    .replace(/^[\s\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FEFF}]+$/gmu, '')
    .replace(/^[\u2022\-=\u2500\u2501\u00B7\s]{5,}$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function formatTikTokCaption(text) {
  if ((text.match(/\n/g) || []).length > 5) return text
  return text
    .replace(/\s+(Ingredients\b)/gi, '\n$1')
    .replace(/\s+(Instructions\b|Steps\b|Directions\b|Method\b)/gi, '\n$1')
    .replace(/\s+-\s+(\d|[A-Z])/g, '\n- $1')
    .replace(/\s+(\d+\.\s+[A-Z])/g, '\n$1')
    .trim()
}

// --- Instagram: extract caption from rendered DOM ---
function extractInstagramCaption() {
  var html = document.documentElement.outerHTML

  // Try caption-specific JSON path: "caption":{"text":"..."}
  var captionMatches = html.match(/"caption"\s*:\s*\{[^}]*?"text"\s*:\s*"((?:[^"\\]|\\.)*)"/g) || []
  var captions = []
  for (var i = 0; i < captionMatches.length; i++) {
    var m = captionMatches[i].match(/"text"\s*:\s*"((?:[^"\\]|\\.)*)"/)
    if (m) {
      var decoded = decodeJsonString(m[1])
      if (decoded.length >= 50) captions.push(decoded)
    }
  }
  captions.sort(function(a, b) { return b.length - a.length })
  if (captions.length > 0) return cleanSocialCaption(captions[0])

  // Fallback: og:description
  var ogMeta = document.querySelector('meta[property="og:description"]')
  if (ogMeta) {
    var ogText = decodeEntities(ogMeta.getAttribute('content') || '').replace(/\\n/g, '\n')
    ogText = ogText.replace(/^[\d.,KMB]+\s*likes?,?\s*[\d.,KMB]+\s*comments?\s*-\s*\w+\s+on\s+[^:]+:\s*"?/, '')
    ogText = ogText.replace(/"\s*\.?\s*$/, '')
    if (ogText.length >= 50) return cleanSocialCaption(ogText)
  }

  // Fallback: visible caption in DOM
  var captionEl = document.querySelector('h1') || document.querySelector('[class*="Caption"]')
  if (captionEl && captionEl.textContent.length >= 50) return cleanSocialCaption(captionEl.textContent)

  return null
}

// --- TikTok: extract caption from rendered DOM ---
function extractTikTokCaption() {
  var html = document.documentElement.outerHTML

  // Try rehydration data: "desc":"..."
  var descMatches = html.match(/"desc"\s*:\s*"((?:[^"\\]|\\.)*)"/g) || []
  var descs = []
  for (var i = 0; i < descMatches.length; i++) {
    var m = descMatches[i].match(/"desc"\s*:\s*"((?:[^"\\]|\\.)*)"/)
    if (m) {
      var decoded = decodeJsonString(m[1])
      if (decoded.length >= 50) descs.push(decoded)
    }
  }
  descs.sort(function(a, b) { return b.length - a.length })
  if (descs.length > 0) return formatTikTokCaption(cleanSocialCaption(descs[0]))

  // Fallback: visible caption in DOM
  var captionEl = document.querySelector('[data-e2e="browse-video-desc"]')
    || document.querySelector('[class*="video-meta-caption"]')
    || document.querySelector('[class*="desc"]')
  if (captionEl && captionEl.textContent.length >= 30) {
    return formatTikTokCaption(cleanSocialCaption(captionEl.textContent))
  }

  // Fallback: og:description
  var ogMeta = document.querySelector('meta[property="og:description"]')
  if (ogMeta) {
    var ogText = decodeEntities(ogMeta.getAttribute('content') || '').replace(/\\n/g, '\n')
    if (ogText.length >= 50) return formatTikTokCaption(cleanSocialCaption(ogText))
  }

  return null
}

// --- YouTube: extract description + captions from rendered DOM ---
function extractYouTubeCaption() {
  // 1. Try video description from DOM
  var descEl = document.querySelector('#description-inner') || document.querySelector('ytd-text-inline-expander')
  if (descEl) {
    var descText = descEl.textContent.trim()
    if (descText.length >= 80) return descText
  }

  // 2. Try shortDescription from player response
  try {
    var sd = window.ytInitialPlayerResponse.videoDetails.shortDescription
    if (sd && sd.length >= 80) return sd
  } catch (e) { /* */ }

  // 3. Fallback: og:description (usually generic for Shorts)
  var ogMeta = document.querySelector('meta[property="og:description"]')
  if (ogMeta) {
    var ogText = decodeEntities(ogMeta.getAttribute('content') || '')
    if (ogText.length >= 80 && !/upload original content/i.test(ogText)) return ogText
  }

  return null
}

// Async: fetch YouTube captions via background worker (bypasses CORS)
function extractYouTubeCaptions(callback) {
  try {
    var pr = window.ytInitialPlayerResponse
    if (!pr || !pr.captions || !pr.captions.playerCaptionsTracklistRenderer) {
      callback(null); return
    }
    var tracks = pr.captions.playerCaptionsTracklistRenderer.captionTracks
    if (!tracks || tracks.length === 0) { callback(null); return }

    // Prefer English, fall back to first track
    var track = tracks[0]
    for (var i = 0; i < tracks.length; i++) {
      if (tracks[i].languageCode === 'en') { track = tracks[i]; break }
    }

    chrome.runtime.sendMessage({ type: 'FETCH_CAPTIONS', url: track.baseUrl }, function(response) {
      if (response && response.transcript && response.transcript.length >= 50) {
        callback(response.transcript)
      } else {
        callback(null)
      }
    })
  } catch (e) {
    callback(null)
  }
}

// --- Facebook: extract post text from DOM ---
function extractFacebookCaption() {
  var html = document.documentElement.outerHTML

  // Try Relay-style JSON: longest "text":"..." value
  var matches = html.match(/"text"\s*:\s*"((?:[^"\\]|\\.)*)"/g) || []
  var texts = []
  for (var i = 0; i < matches.length; i++) {
    var m = matches[i].match(/"text"\s*:\s*"((?:[^"\\]|\\.)*)"/)
    if (m) {
      var decoded = decodeJsonString(m[1])
      if (decoded.length >= 100) texts.push(decoded)
    }
  }
  texts.sort(function(a, b) { return b.length - a.length })
  if (texts.length > 0) return texts[0]

  // Fallback: visible post text in DOM
  var postEl = document.querySelector('[data-ad-preview="message"]')
    || document.querySelector('[data-testid="post_message"]')
  if (postEl && postEl.textContent.length >= 50) return postEl.textContent.trim()

  return null
}

// --- Unified social media extractor ---
// Returns result synchronously for most platforms, or null.
// For YouTube captions (async), use extractSocialMediaAsync.
function extractSocialMedia() {
  var host = window.location.hostname.toLowerCase()
  var caption = null

  if (host.includes('instagram.com')) caption = extractInstagramCaption()
  else if (host.includes('tiktok.com')) caption = extractTikTokCaption()
  else if (host.includes('youtube.com')) caption = extractYouTubeCaption()
  else if (host.includes('facebook.com')) caption = extractFacebookCaption()

  if (!caption || caption.length < 30) return null

  var title = document.querySelector('title')
  var titleText = title ? title.textContent.trim().replace(/\s*[|\u2013\u2014-]\s*(Instagram|TikTok|YouTube|Facebook).*$/i, '') : 'Social Media Recipe'
  var ogImage = document.querySelector('meta[property="og:image"]')

  return {
    '@type': 'Recipe',
    name: titleText,
    image: ogImage ? ogImage.getAttribute('content') : null,
    _captionText: caption,
  }
}

// Async version: tries sync first, then falls back to YouTube captions
function extractSocialMediaAsync(callback) {
  var syncResult = extractSocialMedia()
  if (syncResult) { callback(syncResult); return }

  // For YouTube: try captions via background worker
  var host = window.location.hostname.toLowerCase()
  if (host.includes('youtube.com')) {
    extractYouTubeCaptions(function(transcript) {
      if (!transcript) { callback(null); return }

      var title = document.querySelector('title')
      var titleText = title ? title.textContent.trim().replace(/\s*[|\u2013\u2014-]\s*YouTube.*$/i, '') : 'YouTube Recipe'
      // Also try to get the video title from player response
      try {
        var vt = window.ytInitialPlayerResponse.videoDetails.title
        if (vt) titleText = vt.replace(/#\w+/g, '').trim()
      } catch (e) { /* */ }

      var ogImage = document.querySelector('meta[property="og:image"]')

      callback({
        '@type': 'Recipe',
        name: titleText,
        image: ogImage ? ogImage.getAttribute('content') : null,
        _captionText: transcript,
      })
    })
    return
  }

  callback(null)
}

// Build a recipe from parsed caption text
function buildSocialRecipe(captionData, url) {
  var sourceDomain = ''
  try { sourceDomain = new URL(url).hostname.replace(/^www\./, '') } catch (e) { /* */ }

  var ogImage = document.querySelector('meta[property="og:image"]')

  // Split the caption into lines and categorize
  var lines = captionData._captionText.split('\n').filter(function(l) { return l.trim() })
  var ingredients = []
  var steps = []
  var section = 'unknown'
  var QTY_RE = /^[\d\u00bd\u00bc\u00be\u2153\u2154][\d\/.\u00bd\u00bc\u00be\u2153\u2154-]*\s/
  var COOK_RE = /\b(cook|bake|roast|grill|fry|simmer|boil|steam|stir|mix|combine|whisk|blend|heat|preheat|melt|pour|add|toss|season|marinate|serve)\b/i

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim()
    var lower = line.toLowerCase()
    if (/^ingredients\b/i.test(lower)) { section = 'ingredients'; continue }
    if (/^(instructions|steps|directions|method)\b/i.test(lower)) { section = 'steps'; continue }

    var cleaned = line.replace(/^[-*\u2022]\s*/, '').replace(/^\d+\.\s*/, '').trim()
    if (!cleaned) continue

    if (section === 'ingredients') {
      ingredients.push(cleaned)
    } else if (section === 'steps') {
      steps.push(cleaned)
    } else {
      if (/^[-*\u2022]\s/.test(line) || QTY_RE.test(cleaned)) {
        ingredients.push(cleaned)
      } else if (/^\d+\.\s/.test(line)) {
        steps.push(cleaned)
      } else if (cleaned.length > 20 && COOK_RE.test(cleaned)) {
        steps.push(cleaned)
      }
    }
  }

  return {
    title: captionData.name || 'Social Media Recipe',
    sourceUrl: url,
    sourceDomain: sourceDomain,
    author: null,
    description: null,
    imageUrl: ogImage ? ogImage.getAttribute('content') : null,
    servings: null,
    servingsText: null,
    prepTimeMinutes: null,
    cookTimeMinutes: null,
    totalTimeMinutes: null,
    rawIngredients: ingredients,
    rawSteps: steps.map(function(s, i) { return { order: i + 1, text: s } }),
    keywords: [],
    cuisines: [],
    categories: [],
    extractionLayer: 'social',
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
    } else if (isSocialMediaPage()) {
      // Layer 4: Social media caption extraction (may be async for YT captions)
      extractSocialMediaAsync(function(social) {
        if (social) {
          var socialRecipe = buildSocialRecipe(social, url)
          if (socialRecipe.rawIngredients.length > 0 || socialRecipe.rawSteps.length > 0) {
            sendResponse({ type: 'RECIPE_DATA', recipe: socialRecipe })
          } else {
            sendResponse({
              type: 'SOCIAL_TEXT',
              text: social._captionText,
              title: social.name,
              imageUrl: social.image,
            })
          }
        } else {
          sendResponse({ type: 'NO_RECIPE' })
        }
      })
    } else {
      sendResponse({ type: 'NO_RECIPE' })
    }
  } catch (e) {
    sendResponse({ type: 'NO_RECIPE' })
  }

  return true
})
