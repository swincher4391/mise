/**
 * Mise Bookmarklet — "Save to Mise"
 *
 * Extracts recipe JSON-LD or Microdata from the current page and opens
 * Mise with the recipe data. Works in any browser (Safari, Chrome, Firefox).
 *
 * To create the bookmarklet, minify this and prefix with `javascript:`.
 * The generated bookmarklet URL is in bookmarklet-url.txt.
 */
(function () {
  var MISE_URL = 'https://mise.swinch.dev'

  // --- Extract JSON-LD ---
  function findRecipes(obj) {
    var recipes = []
    if (!obj || typeof obj !== 'object') return recipes
    if (
      typeof obj['@type'] === 'string'
        ? obj['@type'] === 'Recipe' || obj['@type'].endsWith('/Recipe')
        : Array.isArray(obj['@type']) &&
          obj['@type'].some(function (t) {
            return t === 'Recipe' || t.endsWith('/Recipe')
          })
    ) {
      recipes.push(obj)
      return recipes
    }
    if (Array.isArray(obj['@graph'])) {
      obj['@graph'].forEach(function (item) {
        recipes = recipes.concat(findRecipes(item))
      })
      return recipes
    }
    if (Array.isArray(obj)) {
      obj.forEach(function (item) {
        recipes = recipes.concat(findRecipes(item))
      })
    }
    return recipes
  }

  function extractJsonLd() {
    var scripts = document.querySelectorAll('script[type="application/ld+json"]')
    var recipes = []
    scripts.forEach(function (el) {
      try {
        var parsed = JSON.parse(el.textContent)
        recipes = recipes.concat(findRecipes(parsed))
      } catch (e) {}
    })
    return recipes
  }

  // --- Extract Microdata ---
  function extractMicrodata() {
    var els = document.querySelectorAll('[itemtype*="schema.org/Recipe"]')
    if (els.length === 0) return []

    var recipes = []
    els.forEach(function (root) {
      var result = {}
      var arrayProps = [
        'recipeIngredient',
        'ingredients',
        'recipeInstructions',
        'step',
      ]

      function getValue(el) {
        var tag = el.tagName.toLowerCase()
        if (tag === 'meta') return el.getAttribute('content') || ''
        if (tag === 'img') return el.getAttribute('src') || ''
        if (tag === 'a' || tag === 'link') return el.getAttribute('href') || ''
        if (tag === 'time')
          return el.getAttribute('datetime') || el.textContent.trim()
        return el.textContent.trim()
      }

      function walk(parent) {
        Array.from(parent.children).forEach(function (child) {
          var prop = child.getAttribute('itemprop')
          var isScope = child.hasAttribute('itemscope')
          if (prop) {
            var val = isScope ? {} : getValue(child)
            if (arrayProps.indexOf(prop) !== -1) {
              if (!Array.isArray(result[prop])) result[prop] = []
              result[prop].push(val)
            } else {
              result[prop] = val
            }
          }
          if (!isScope) walk(child)
        })
      }

      walk(root)
      result['@type'] = 'Recipe'
      recipes.push(result)
    })
    return recipes
  }

  // --- Normalize ---
  function normalize(raw) {
    var title = raw.name || raw.headline || 'Untitled Recipe'
    var url = window.location.href
    var domain = window.location.hostname.replace(/^www\./, '')

    var author = null
    if (raw.author) {
      if (typeof raw.author === 'string') author = raw.author
      else if (raw.author.name) author = raw.author.name
      else if (Array.isArray(raw.author) && raw.author[0])
        author = raw.author[0].name || null
    }

    var imageUrl = null
    if (raw.image) {
      if (typeof raw.image === 'string') imageUrl = raw.image
      else if (raw.image.url) imageUrl = raw.image.url
      else if (Array.isArray(raw.image) && raw.image[0])
        imageUrl =
          typeof raw.image[0] === 'string' ? raw.image[0] : raw.image[0].url
    }

    var ingredients = (raw.recipeIngredient || raw.ingredients || []).filter(
      function (i) {
        return typeof i === 'string'
      }
    )

    var steps = []
    var rawSteps = raw.recipeInstructions || []
    if (typeof rawSteps === 'string') {
      rawSteps.split(/\n+/).forEach(function (s, i) {
        var t = s.trim()
        if (t) steps.push({ order: i + 1, text: t })
      })
    } else if (Array.isArray(rawSteps)) {
      rawSteps.forEach(function (s, i) {
        if (typeof s === 'string') steps.push({ order: i + 1, text: s.trim() })
        else if (s.text) steps.push({ order: i + 1, text: s.text.trim() })
      })
    }

    return {
      title: title,
      sourceUrl: url,
      sourceDomain: domain,
      author: author,
      description: raw.description || null,
      imageUrl: imageUrl,
      servings: null,
      servingsText: raw.recipeYield
        ? Array.isArray(raw.recipeYield)
          ? raw.recipeYield[0]
          : raw.recipeYield
        : null,
      prepTimeMinutes: null,
      cookTimeMinutes: null,
      totalTimeMinutes: null,
      rawIngredients: ingredients,
      rawSteps: steps,
      keywords: raw.keywords
        ? typeof raw.keywords === 'string'
          ? raw.keywords.split(',').map(function (k) {
              return k.trim()
            })
          : raw.keywords
        : [],
      cuisines: raw.recipeCuisine
        ? typeof raw.recipeCuisine === 'string'
          ? [raw.recipeCuisine]
          : raw.recipeCuisine
        : [],
      categories: raw.recipeCategory
        ? typeof raw.recipeCategory === 'string'
          ? [raw.recipeCategory]
          : raw.recipeCategory
        : [],
      extractionLayer: 'json-ld',
    }
  }

  // --- Main ---
  var recipes = extractJsonLd()
  var layer = 'json-ld'
  if (recipes.length === 0) {
    recipes = extractMicrodata()
    layer = 'microdata'
  }

  if (recipes.length === 0) {
    alert('No recipe found on this page.')
    return
  }

  var recipe = normalize(recipes[0])
  recipe.extractionLayer = layer

  var payload = btoa(unescape(encodeURIComponent(JSON.stringify(recipe))))
  window.open(MISE_URL + '#import=' + payload, '_blank')
})()
