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
