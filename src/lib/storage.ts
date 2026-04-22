import type { AdminSession } from './types'

const SESSION_KEY = 'cravix-admin/session'
const ACTIVE_TAB_KEY = 'cravix-admin/active-tab'

export function readSession(): AdminSession | null {
  const raw = window.localStorage.getItem(SESSION_KEY)
  if (!raw) {
    return null
  }
  try {
    return JSON.parse(raw) as AdminSession
  } catch {
    return null
  }
}

export function writeSession(session: AdminSession): void {
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

export function clearSession(): void {
  window.localStorage.removeItem(SESSION_KEY)
}

export function readActiveTab(): string | null {
  return window.localStorage.getItem(ACTIVE_TAB_KEY)
}

export function writeActiveTab(tab: string): void {
  window.localStorage.setItem(ACTIVE_TAB_KEY, tab)
}
