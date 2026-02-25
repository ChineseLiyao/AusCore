const isDev = import.meta.env.DEV

export const API_BASE = isDev ? 'http://localhost:13338' : ''
export const WS_BASE = isDev ? 'ws://localhost:13338' : `ws://${window.location.host}`
