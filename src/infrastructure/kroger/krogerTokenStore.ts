/** Check Kroger authentication status via server-side cookie */
export async function checkKrogerAuth(): Promise<boolean> {
  try {
    const res = await fetch('/api/grocery/kroger-status', { credentials: 'same-origin' })
    if (!res.ok) return false
    const data = await res.json()
    return data.authenticated === true
  } catch {
    return false
  }
}

/** Log out of Kroger by clearing server-side cookie */
export async function logoutKroger(): Promise<void> {
  await fetch('/api/grocery/kroger-logout', {
    method: 'POST',
    credentials: 'same-origin',
  }).catch(() => {})
}
