/**
 * Pending Cravix MCP sign-in request.
 *
 * The local MCP opens /connect/mcp with its loopback redirect and PKCE challenge.
 * The request is kept in sessionStorage so it survives the Google sign-in
 * redirect, then the administrator approves it on McpConnectView.
 */
export type McpConnectRequest = {
  redirectUri: string
  state: string
  codeChallenge: string
  createdAt: number
}

const STORAGE_KEY = 'cravix-admin/mcp-connect'
const MAX_AGE_MS = 10 * 60 * 1000
// Mirrors the backend: only the MCP on this computer may receive the code.
const LOOPBACK_REDIRECT = /^http:\/\/(127\.0\.0\.1|localhost):[0-9]{2,5}\/callback$/
const CHALLENGE = /^[A-Za-z0-9_-]{43,128}$/
const STATE = /^[A-Za-z0-9_-]{8,128}$/

export const MCP_CONNECT_PATH = '/connect/mcp'

/** Reads a request from the current URL (then cleans the URL), or a stored one. */
export function takePendingMcpConnect(): McpConnectRequest | null {
  if (window.location.pathname === MCP_CONNECT_PATH) {
    const params = new URLSearchParams(window.location.search)
    const request = {
      redirectUri: params.get('redirect_uri') ?? '',
      state: params.get('state') ?? '',
      codeChallenge: params.get('code_challenge') ?? '',
      createdAt: Date.now(),
    }
    window.history.replaceState({}, document.title, '/')
    if (
      LOOPBACK_REDIRECT.test(request.redirectUri) &&
      CHALLENGE.test(request.codeChallenge) &&
      STATE.test(request.state) &&
      (params.get('code_challenge_method') ?? 'S256') === 'S256'
    ) {
      try {
        window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(request))
      } catch {
        // Without storage the request still works if no sign-in redirect is needed.
      }
      return request
    }
    clearPendingMcpConnect()
    return null
  }
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const stored = JSON.parse(raw) as McpConnectRequest
    if (Date.now() - stored.createdAt > MAX_AGE_MS || !LOOPBACK_REDIRECT.test(stored.redirectUri)) {
      clearPendingMcpConnect()
      return null
    }
    return stored
  } catch {
    clearPendingMcpConnect()
    return null
  }
}

export function clearPendingMcpConnect(): void {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing to clear.
  }
}

export function mcpCallbackUrl(request: McpConnectRequest, params: Record<string, string>): string {
  const url = new URL(request.redirectUri)
  Object.entries({ ...params, state: request.state }).forEach(([key, value]) => url.searchParams.set(key, value))
  return url.toString()
}
