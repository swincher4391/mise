// Shared Kroger OAuth2 helper — not an endpoint

const TOKEN_URL = 'https://api.kroger.com/v1/connect/oauth2/token'

interface TokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  refresh_token?: string
}

// Module-level cache for client credentials token
let cachedClientToken: string | null = null
let cachedClientExpiry = 0

function getCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.KROGER_CLIENT_ID
  const clientSecret = process.env.KROGER_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('KROGER_CLIENT_ID and KROGER_CLIENT_SECRET must be set')
  }
  return { clientId, clientSecret }
}

function basicAuth(clientId: string, clientSecret: string): string {
  return Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
}

export async function getClientToken(): Promise<string> {
  // Return cached token if still valid (with 60s buffer)
  if (cachedClientToken && Date.now() < cachedClientExpiry - 60_000) {
    return cachedClientToken
  }

  const { clientId, clientSecret } = getCredentials()

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth(clientId, clientSecret)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials&scope=product.compact',
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Kroger client auth failed (${response.status}): ${text.slice(0, 200)}`)
  }

  const data: TokenResponse = await response.json()
  cachedClientToken = data.access_token
  cachedClientExpiry = Date.now() + data.expires_in * 1000
  return data.access_token
}

export async function exchangeCode(code: string, redirectUri: string): Promise<TokenResponse> {
  const { clientId, clientSecret } = getCredentials()

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth(clientId, clientSecret)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `grant_type=authorization_code&code=${encodeURIComponent(code)}&redirect_uri=${encodeURIComponent(redirectUri)}`,
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Kroger code exchange failed (${response.status}): ${text.slice(0, 200)}`)
  }

  return response.json()
}

export async function refreshUserToken(refreshToken: string): Promise<TokenResponse> {
  const { clientId, clientSecret } = getCredentials()

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth(clientId, clientSecret)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`,
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Kroger token refresh failed (${response.status}): ${text.slice(0, 200)}`)
  }

  return response.json()
}
