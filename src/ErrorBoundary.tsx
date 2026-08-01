import { Component, type ErrorInfo, type ReactNode } from 'react'

import { reportAdminClientError } from './lib/api'
import { readSession } from './lib/storage'

type Props = { children: ReactNode }
type State = { failed: boolean }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const fingerprint = `${error.name}:${info.componentStack?.length ?? 0}`
    void reportAdminClientError(
      `react_render_${fingerprint}`,
      error,
      readSession()?.access_token,
    )
  }

  render() {
    if (this.state.failed) {
      return (
        <main className="auth-shell">
          <section className="auth-card">
            <div className="auth-copy">
              <p className="eyebrow">Cravix Admin</p>
              <h1>This screen could not be displayed.</h1>
              <p className="lede">The error was recorded. Reload the admin portal to continue.</p>
            </div>
            <button className="primary-button" onClick={() => window.location.reload()}>
              Reload portal
            </button>
          </section>
        </main>
      )
    }
    return this.props.children
  }
}
