// App de iPhone (Capacitor): contrato de cliente nativo (docs/IOS.md).
// El cliente declara `X-MobOS-Client: ios/<versión>`; solo entonces las
// respuestas de acceso devuelven el token en el cuerpo. Un navegador normal
// (app.moboss.online) nunca recibe tokens en el cuerpo, aunque envíe el header:
// el origen tiene que ser el del WebView de Capacitor o estar ausente (HTTP nativo).
export const NATIVE_APP_ORIGINS = ['capacitor://localhost', 'ionic://localhost'] as const
const NATIVE_CLIENT_PATTERN = /^ios\/[0-9A-Za-z][0-9A-Za-z.+-]{0,31}$/

export function nativeClientVersion(request: Request): string | null {
  const header = request.headers.get('x-mobos-client')?.trim() || ''
  if (!NATIVE_CLIENT_PATTERN.test(header)) return null
  const origin = request.headers.get('origin')
  if (origin && !(NATIVE_APP_ORIGINS as readonly string[]).includes(origin)) return null
  return header.slice(4)
}

export function isNativeClient(request: Request) {
  return nativeClientVersion(request) !== null
}

/** Comparación numérica de versiones «1.2.3». */
export function versionAtLeast(version: string, minimum: string) {
  const parse = (value: string) => value.split(/[.+-]/).slice(0, 3).map(part => Number.parseInt(part, 10) || 0)
  const a = parse(version), b = parse(minimum)
  for (let i = 0; i < 3; i += 1) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0)
  }
  return true
}
