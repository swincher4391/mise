import posthog from 'posthog-js'

const POSTHOG_KEY = (import.meta.env.VITE_POSTHOG_KEY ?? '').trim()
const POSTHOG_HOST = 'https://us.i.posthog.com'

const FIRST_TOUCH_KEY = 'mise_first_touch'
const UTM_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const

/**
 * First-touch attribution.
 *
 * PostHog's own initial-UTM properties are session-scoped and get clobbered on a
 * later visit; the affiliate model needs to tie a Reddit/TikTok click to an
 * Instacart checkout that can happen days later, in a different session. So we
 * capture the *first* campaign we ever see, persist it in localStorage, and
 * register it as a super-property on every subsequent event.
 */
function captureFirstTouchAttribution() {
  try {
    let stored = localStorage.getItem(FIRST_TOUCH_KEY)

    if (!stored) {
      const params = new URLSearchParams(window.location.search)
      const utm: Record<string, string> = {}
      for (const key of UTM_PARAMS) {
        const value = params.get(key)
        if (value) utm[`first_${key}`] = value.slice(0, 200)
      }
      // Only record a first touch when a campaign actually brought them in;
      // otherwise a later UTM'd visit can still be the first attributed one.
      if (Object.keys(utm).length > 0) {
        utm.first_touch_at = new Date().toISOString()
        utm.first_landing_path = window.location.pathname.slice(0, 200)
        stored = JSON.stringify(utm)
        localStorage.setItem(FIRST_TOUCH_KEY, stored)
      }
    }

    if (stored) {
      // register() makes these persistent super-properties — attached to every
      // event, including upgrade_completed and instacart_*_click.
      posthog.register(JSON.parse(stored))
    }
  } catch {
    // localStorage unavailable / malformed — attribution is best-effort.
  }
}

export function initAnalytics() {
  if (typeof window === 'undefined' || !POSTHOG_KEY) return
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    ui_host: 'https://us.posthog.com',
    autocapture: true,
    capture_pageview: true,
    capture_pageleave: true,
    persistence: 'localStorage',
    // Privacy-first alignment (see docs/analytics-consent-posture.md): create a
    // person profile only once a user identifies at purchase, not for every
    // anonymous visitor. Event-based funnels and first-touch attribution still
    // work; we just don't build person profiles for people who never buy.
    person_profiles: 'identified_only',
    loaded: captureFirstTouchAttribution,
  })
}

export function trackEvent(name: string, properties?: Record<string, string | number | boolean>) {
  posthog.capture(name, properties)
}

export function identifyUser(email: string) {
  posthog.identify(email)
}
