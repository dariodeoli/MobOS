// URL pública del instalador del agente (#17, bug de #185). El instalador lo
// sirve el backend (`public/print-agent/install.sh`), pero detrás del proxy el
// `request.url` trae el **origen interno** (p. ej. `https://0.0.0.0:3000`): la
// URL publicada salía rota y toda guía que la use entregaba un comando muerto.
//
// Cadena de resolución (primera que existe gana):
//   1. `MOBOS_PRINT_INSTALL_BASE` — override explícito (proxy/CDN propio).
//   2. `MOBOS_API_URL` — URL pública del API (se usa su origen).
//   3. `X-Forwarded-Host` + `X-Forwarded-Proto` — solo con
//      `MOBOS_TRUST_PROXY=true` (mismo criterio que la IP real en auth.ts).
//   4. Último recurso: el origen del request (correcto en local).
// Módulo puro: recibe `env` para poder testearlo sin tocar el proceso.

const limpiar = (valor: unknown) => String(valor ?? '').trim().replace(/\/+$/, '')

// Origen de una URL configurada: si trae path (p. ej. `https://host/api`) se
// descarta, porque el instalador vive en la raíz del host.
const origenDe = (valor: unknown) => {
  const texto = limpiar(valor)
  if (!texto) return ''
  try {
    return new URL(texto).origin
  } catch {
    return texto
  }
}

// Host de `X-Forwarded-Host` saneado: sin esquema, sin path, con puerto opcional.
const hostValido = (valor: unknown) => {
  const host = String(valor ?? '').split(',')[0].trim().toLowerCase()
  return /^[a-z0-9.-]+(:\d{1,5})?$/.test(host) ? host : ''
}

// Entorno del instalador: la resolución solo lee estas tres variables. Se tipa
// como diccionario (claves conocidas + índice) para admitir entornos parciales
// (tests) sin exigir el `NodeJS.ProcessEnv` completo, que Next aumenta con
// `NODE_ENV` obligatorio.
export type EntornoInstalador = {
  MOBOS_PRINT_INSTALL_BASE?: string
  MOBOS_API_URL?: string
  MOBOS_TRUST_PROXY?: string
  [clave: string]: string | undefined
}

export function baseDeInstalacion(request: Request, env: EntornoInstalador = process.env): string {
  const configurada = limpiar(env.MOBOS_PRINT_INSTALL_BASE)
  if (configurada) return configurada

  const apiUrl = origenDe(env.MOBOS_API_URL)
  if (apiUrl) return apiUrl

  if (limpiar(env.MOBOS_TRUST_PROXY).toLowerCase() === 'true') {
    const host = hostValido(request.headers.get('x-forwarded-host'))
    if (host) {
      const proto = String(request.headers.get('x-forwarded-proto') || '').split(',')[0].trim().toLowerCase()
      const esquema = proto === 'http' || proto === 'https' ? proto : new URL(request.url).protocol.replace(':', '')
      return `${esquema}://${host}`
    }
  }

  return new URL(request.url).origin
}

export function urlDeInstalacion(request: Request, env: EntornoInstalador = process.env): string {
  return `${baseDeInstalacion(request, env)}/print-agent/install.sh`
}
