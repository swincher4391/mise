import posthog from 'posthog-js'

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY ?? ''
const POSTHOG_HOST = 'https://us.i.posthog.com'

export function initAnalytics() {
  if (typeof window === 'undefined') return
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    autocapture: false,
    capture_pageview: true,
    capture_pageleave: true,
    persistence: 'localStorage',
    person_profiles: 'identified_only',
  })
}

export function trackEvent(name: string, properties?: Record<string, string | number | boolean>) {
  posthog.capture(name, properties)
}

export function identifyUser(email: string) {
  posthog.identify(email)
}
