/* eslint-disable no-undef */

const MISE_URL = 'https://mise.swinch.dev'

const extractView = document.getElementById('extract-view')
const loadingView = document.getElementById('loading-view')
const resultView = document.getElementById('result-view')
const errorView = document.getElementById('error-view')

const extractBtn = document.getElementById('extract-btn')
const openBtn = document.getElementById('open-btn')
const saveBtn = document.getElementById('save-btn')
const retryBtn = document.getElementById('retry-btn')
const recipeTitleEl = document.getElementById('recipe-title')
const recipeSourceEl = document.getElementById('recipe-source')
const errorMsg = document.getElementById('error-msg')

let currentRecipe = null

function showView(view) {
  extractView.classList.add('hidden')
  loadingView.classList.add('hidden')
  resultView.classList.add('hidden')
  errorView.classList.add('hidden')
  view.classList.remove('hidden')
}

function showError(message) {
  errorMsg.textContent = message
  showView(errorView)
}

extractBtn.addEventListener('click', async () => {
  showView(loadingView)

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) {
      showError('No active tab found.')
      return
    }

    const response = await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_RECIPE' })

    if (response?.type === 'RECIPE_DATA' && response.recipe) {
      currentRecipe = response.recipe
      recipeTitleEl.textContent = response.recipe.title || 'Untitled Recipe'
      recipeSourceEl.textContent = response.recipe.sourceDomain || ''
      showView(resultView)
    } else if (response?.type === 'NO_RECIPE') {
      showError('No recipe found on this page.')
    } else {
      showError('Could not communicate with page. Try refreshing.')
    }
  } catch (err) {
    showError('Failed to extract recipe. Try refreshing the page.')
  }
})

openBtn.addEventListener('click', () => {
  if (!currentRecipe) return

  // Try BroadcastChannel first
  try {
    const channel = new BroadcastChannel('mise-recipe-import')
    channel.postMessage({ type: 'IMPORT_RECIPE', recipe: currentRecipe })
    channel.close()
  } catch {
    // BroadcastChannel not available
  }

  // Also open via hash fragment as fallback
  const payload = btoa(JSON.stringify(currentRecipe))
  chrome.tabs.create({ url: `${MISE_URL}#import=${payload}` })
  window.close()
})

saveBtn.addEventListener('click', () => {
  if (!currentRecipe) return

  // Send via BroadcastChannel
  try {
    const channel = new BroadcastChannel('mise-recipe-import')
    channel.postMessage({ type: 'IMPORT_RECIPE', recipe: currentRecipe })
    channel.close()
    saveBtn.textContent = 'Sent!'
    saveBtn.disabled = true
  } catch {
    // Fall back to opening the app
    const payload = btoa(JSON.stringify(currentRecipe))
    chrome.tabs.create({ url: `${MISE_URL}#import=${payload}` })
    window.close()
  }
})

retryBtn.addEventListener('click', () => {
  showView(extractView)
})
