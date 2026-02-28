import posthog from 'posthog-js'

const POSTHOG_KEY = (import.meta.env.VITE_POSTHOG_KEY ?? '').trim()
const POSTHOG_HOST = 'https://us.i.posthog.com'

export function initAnalytics() {
  if (typeof window === 'undefined' || !POSTHOG_KEY) return
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    ui_host: 'https://us.posthog.com',
    autocapture: false,
    capture_pageview: true,
    capture_pageleave: true,
    persistence: 'localStorage',
    person_profiles: 'identified_only',
    advanced_disable_decide: true,
  })
}

export function trackEvent(name: string, properties?: Record<string, string | number | boolean>) {
  posthog.capture(name, properties)
}

export function identifyUser(email: string) {
  posthog.identify(email)
}
