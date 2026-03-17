/* eslint-disable no-undef */

/**
 * Mise Extension Background Service Worker
 * - Context menu: "Extract recipe with Mise"
 * - Badge indicator: shows when recipe detected on page
 */

const MISE_URL = 'https://mise.swinch.dev'

// --- Context Menu ---

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'mise-extract',
    title: 'Extract recipe with Mise',
    contexts: ['page'],
  })
})

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'mise-extract' || !tab?.id) return

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_RECIPE' })
    if (response?.type === 'RECIPE_DATA' && response.recipe) {
      const payload = btoa(unescape(encodeURIComponent(JSON.stringify(response.recipe))))
      chrome.tabs.create({ url: `${MISE_URL}#import=${payload}` })
    }
  } catch {
    // Content script not ready — open Mise with the URL for server-side extraction
    chrome.tabs.create({ url: `${MISE_URL}?url=${encodeURIComponent(tab.url)}` })
  }
})

// --- YouTube Caption Fetch (bypasses page CORS) ---

chrome.runtime.onMessage.addListener(function(message, _sender, sendResponse) {
  if (message.type !== 'FETCH_CAPTIONS') return false

  fetch(message.url).then(function(resp) {
    if (!resp.ok) throw new Error('HTTP ' + resp.status)
    return resp.text()
  }).then(function(xml) {
    var lines = []
    var re = /<text[^>]*>([\s\S]*?)<\/text>/g
    var m
    while ((m = re.exec(xml)) !== null) {
      var text = m[1].trim()
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
      if (text && text !== '\n') lines.push(text)
    }
    sendResponse({ transcript: lines.join(' ') })
  }).catch(function(e) {
    sendResponse({ error: e.message })
  })

  return true
})

// --- Badge Indicator ---

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.status !== 'complete') return

  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: 'DETECT_RECIPE' })
    if (response?.hasRecipe) {
      chrome.action.setBadgeText({ text: '✓', tabId })
      chrome.action.setBadgeBackgroundColor({ color: '#2d5016', tabId })
    } else {
      chrome.action.setBadgeText({ text: '', tabId })
    }
  } catch {
    // Content script not injected (chrome:// pages, etc.)
    chrome.action.setBadgeText({ text: '', tabId })
  }
})

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: 'DETECT_RECIPE' })
    if (response?.hasRecipe) {
      chrome.action.setBadgeText({ text: '✓', tabId })
      chrome.action.setBadgeBackgroundColor({ color: '#2d5016', tabId })
    } else {
      chrome.action.setBadgeText({ text: '', tabId })
    }
  } catch {
    chrome.action.setBadgeText({ text: '', tabId })
  }
})
