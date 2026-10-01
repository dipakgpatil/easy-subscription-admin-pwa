import { useState } from 'react'
import { Bot, LoaderCircle, ShieldCheck, X } from 'lucide-react'
import { ApiError, authorizeMcp } from '../../lib/api'
import type { AdminSession } from '../../lib/types'
import { clearPendingMcpConnect, mcpCallbackUrl, type McpConnectRequest } from './mcpConnect'

type McpConnectViewProps = {
  session: AdminSession
  request: McpConnectRequest
  onDone: () => void
  onSessionExpired: () => void
}

/** Lets a signed-in administrator approve the Cravix MCP running on their computer. */
export default function McpConnectView({ session, request, onDone, onSessionExpired }: McpConnectViewProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [finished, setFinished] = useState<'allowed' | 'denied' | null>(null)

  async function allow() {
    setBusy(true)
    setError(null)
    try {
      const { code } = await authorizeMcp(session.access_token, request.redirectUri, request.codeChallenge)
      clearPendingMcpConnect()
      setFinished('allowed')
      window.location.assign(mcpCallbackUrl(request, { code }))
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 401) {
        // Keep the request: it resumes here after the administrator signs in again.
        onSessionExpired()
        return
      }
      setError(reason instanceof Error ? reason.message : 'Unable to connect Claude.')
      setBusy(false)
    }
  }

  function deny() {
    clearPendingMcpConnect()
    setFinished('denied')
    window.location.assign(mcpCallbackUrl(request, { error: 'access_denied' }))
  }

  return (
    <main className="auth-shell">
      <section className="auth-card mcp-connect-card">
        <div className="auth-copy">
          <p className="eyebrow">
            <Bot size={16} aria-hidden="true" /> Claude · Cravix MCP
          </p>
          <h1>Connect Claude to Cravix Admin?</h1>
          <p className="lede">
            The Cravix MCP on this computer is asking to act with your administrator access
            {session.email_address ? ` (${session.email_address})` : ''}. Allow it only if you just asked Claude to do
            something in Cravix.
          </p>
          <p className="lede">
            It stays signed in for up to 30 days. Remove it any time by running <code>cravix-mcp logout</code>.
          </p>
        </div>
        {finished ? (
          <p className="success-banner">
            {finished === 'allowed' ? 'Connected. Return to Claude.' : 'Cancelled. You can close this tab.'}
          </p>
        ) : (
          <div className="mcp-connect-actions">
            <button className="ghost-button" type="button" onClick={deny} disabled={busy}>
              <X size={18} />
              Cancel
            </button>
            <button className="primary-button" type="button" onClick={() => void allow()} disabled={busy}>
              {busy ? <LoaderCircle className="is-spinning" size={18} /> : <ShieldCheck size={18} />}
              {busy ? 'Connecting' : 'Allow'}
            </button>
          </div>
        )}
        {error ? <p className="error-banner">{error}</p> : null}
        <button className="ghost-button mcp-connect-skip" type="button" onClick={onDone} disabled={busy}>
          Go to the dashboard instead
        </button>
      </section>
    </main>
  )
}
