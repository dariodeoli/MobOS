// El salto interno del middleware (self-proxy) no puede transportar el header
// `cookie` porque undici lo descarta (forbidden header del spec fetch). La
// cookie viaja por un header propio y se acepta solo en requests que el
// middleware marcó como salto interno y que llegan desde 127.0.0.1 — el
// middleware regenera estos headers en cada salto, por lo que un cliente
// externo no puede inyectarlos (detrás del proxy de producción tampoco puede
// forjar X-Forwarded-For 127.0.0.1).
export const INTERNAL_PASS_HEADER = 'x-mobos-pass'
export const INTERNAL_COOKIE_HEADER = 'x-mobos-internal-cookie'
export const INTERNAL_CLIENT_IP_HEADER = 'x-mobos-client-ip'
export const INTERNAL_PASS_VALUE = '1'
