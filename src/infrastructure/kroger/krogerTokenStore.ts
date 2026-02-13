const ACCESS_KEY = 'kroger_access_token'
const REFRESH_KEY = 'kroger_refresh_token'
const EXPIRY_KEY = 'kroger_token_expiry'

export function saveKrogerTokens(accessToken: string, refreshToken: string, expiresIn: number): void {
  localStorage.setItem(ACCESS_KEY, accessToken)
  localStorage.setItem(REFRESH_KEY, refreshToken)
  localStorage.setItem(EXPIRY_KEY, String(Date.now() + expiresIn * 1000))
}

export function getKrogerAccessToken(): string | null {
  const expiry = localStorage.getItem(EXPIRY_KEY)
  if (expiry && Date.now() > Number(expiry)) {
    // Token expired
    return null
  }
  return localStorage.getItem(ACCESS_KEY)
}

export function getKrogerRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY)
}

export function clearKrogerTokens(): void {
  localStorage.removeItem(ACCESS_KEY)
  localStorage.removeItem(REFRESH_KEY)
  localStorage.removeItem(EXPIRY_KEY)
}

export function hasKrogerTokens(): boolean {
  return localStorage.getItem(ACCESS_KEY) !== null
}
