import type { AdminSession } from './types'

const SESSION_KEY = 'cravix-admin/session'
const ACTIVE_TAB_KEY = 'cravix-admin/active-tab'

export function readSession(): AdminSession | null {
  const raw = window.sessionStorage.getItem(SESSION_KEY) ?? window.localStorage.getItem(SESSION_KEY)
  if (!raw) {
    return null
  }
  try {
    const session = JSON.parse(raw) as AdminSession
    window.sessionStorage.setItem(SESSION_KEY, raw)
    window.localStorage.removeItem(SESSION_KEY)
    return session
  } catch {
    window.sessionStorage.removeItem(SESSION_KEY)
    window.localStorage.removeItem(SESSION_KEY)
    return null
  }
}

export function writeSession(session: AdminSession): void {
  window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
  window.localStorage.removeItem(SESSION_KEY)
}

export function clearSession(): void {
  window.sessionStorage.removeItem(SESSION_KEY)
  window.localStorage.removeItem(SESSION_KEY)
}

export function readActiveTab(): string | null {
  return window.localStorage.getItem(ACTIVE_TAB_KEY)
}

export function writeActiveTab(tab: string): void {
  window.localStorage.setItem(ACTIVE_TAB_KEY, tab)
}
