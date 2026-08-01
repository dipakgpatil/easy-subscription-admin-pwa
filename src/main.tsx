import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './ErrorBoundary.tsx'
import { reportAdminClientError } from './lib/api.ts'
import { readSession } from './lib/storage.ts'

window.addEventListener('error', (event) => {
  void reportAdminClientError(
    'admin_window_error',
    event.error ?? event.message,
    readSession()?.access_token,
  )
})

window.addEventListener('unhandledrejection', (event) => {
  void reportAdminClientError(
    'admin_unhandled_promise',
    event.reason,
    readSession()?.access_token,
  )
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js')
  })
}
