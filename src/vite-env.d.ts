/// <reference types="vite/client" />

interface Window {
  google?: {
    accounts?: {
      id?: {
        initialize: (options: {
          client_id: string
          callback?: (response: { credential: string }) => void
          ux_mode?: 'popup' | 'redirect'
          login_uri?: string
        }) => void
        renderButton: (
          parent: HTMLElement,
          options: {
            theme?: string
            size?: string
            shape?: string
            text?: string
            width?: number
          },
        ) => void
        prompt: () => void
      }
    }
  }
}
