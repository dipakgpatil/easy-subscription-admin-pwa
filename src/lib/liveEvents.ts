import { createContext, useContext, useEffect, useRef } from 'react'

import type { AdminOrderUpdatedEvent, AdminRiderUpdatedEvent } from './types'

/**
 * Live order and rider changes from the admin SSE stream, fanned out to the
 * screens that care. Screens still refresh periodically; these events only make
 * changes appear immediately.
 */
export type LiveEventMap = {
  order: AdminOrderUpdatedEvent
  rider: AdminRiderUpdatedEvent
}

type Handler<K extends keyof LiveEventMap> = (event: LiveEventMap[K]) => void

export type LiveBus = {
  emit: <K extends keyof LiveEventMap>(type: K, event: LiveEventMap[K]) => void
  subscribe: <K extends keyof LiveEventMap>(type: K, handler: Handler<K>) => () => void
}

export function createLiveBus(): LiveBus {
  const handlers: { [K in keyof LiveEventMap]: Set<Handler<K>> } = { order: new Set(), rider: new Set() }
  return {
    emit(type, event) {
      for (const handler of handlers[type]) handler(event)
    },
    subscribe(type, handler) {
      handlers[type].add(handler)
      return () => {
        handlers[type].delete(handler)
      }
    },
  }
}

export const LiveEventsContext = createContext<LiveBus | null>(null)

/** Calls `handler` for each live event of `type`; always sees the latest handler. */
export function useLiveEvent<K extends keyof LiveEventMap>(type: K, handler: Handler<K>): void {
  const bus = useContext(LiveEventsContext)
  const latest = useRef(handler)
  useEffect(() => {
    latest.current = handler
  })
  useEffect(() => {
    if (!bus) return
    return bus.subscribe(type, (event) => latest.current(event))
  }, [bus, type])
}
