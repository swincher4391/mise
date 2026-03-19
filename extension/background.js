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

// --- Tab Screenshot Capture (for video frame OCR) ---

chrome.runtime.onMessage.addListener(function(message, _sender, sendResponse) {
  if (message.type !== 'CAPTURE_TAB') return false

  chrome.tabs.captureVisibleTab(null, { format: 'jpeg', quality: 85 }, function(dataUrl) {
    if (chrome.runtime.lastError) {
      sendResponse({ error: chrome.runtime.lastError.message })
    } else {
      sendResponse({ image: dataUrl })
    }
  })

  return true
})

// --- Badge Indicator ---

function safeBadge(tabId, text, color) {
  try {
    chrome.action.setBadgeText({ text: text, tabId: tabId })
    if (color) chrome.action.setBadgeBackgroundColor({ color: color, tabId: tabId })
  } catch (e) { /* tab gone */ }
}

function updateBadge(tabId) {
  try {
    chrome.tabs.get(tabId, function(tab) {
      if (chrome.runtime.lastError) return
      if (!tab || !tab.url || tab.url.startsWith('chrome')) { safeBadge(tabId, ''); return }
      try {
        chrome.tabs.sendMessage(tabId, { type: 'DETECT_RECIPE' }, function(response) {
          if (chrome.runtime.lastError) return
          safeBadge(tabId, response && response.hasRecipe ? '\u2713' : '', '#2d5016')
        })
      } catch (e) { /* content script not ready */ }
    })
  } catch (e) { /* extension context invalidated */ }
}

chrome.tabs.onUpdated.addListener(function(tabId, changeInfo) {
  if (changeInfo.status === 'complete') updateBadge(tabId)
})

chrome.tabs.onActivated.addListener(function(info) {
  updateBadge(info.tabId)
})
