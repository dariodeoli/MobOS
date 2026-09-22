// Flags del rediseño v2 (#241): la vista previa y la activación de F3 se
// controlan por entorno y nada se activa por defecto.
//
// - `VITE_OPS_PREVIEW=1`: habilita `/ops-preview` (además de desarrollo).
// - `VITE_OPS_V2=1`: activa la ruta real `/ops` (y el menú/datos cuando se
//   apruebe el piloto).
export const esFlag = (valor) => String(valor ?? '').trim() === '1'

export function flagsV2({ dev = false, env = {} } = {}) {
  const activo = esFlag(env.VITE_OPS_V2)
  return {
    opsV2: activo,
    // La vista previa también está disponible en desarrollo o con su flag.
    opsPreview: Boolean(dev) || esFlag(env.VITE_OPS_PREVIEW) || activo,
  }
}

/** Qué vista v2 corresponde a la ruta actual ('preview', 'activo' o null). */
export function rutaV2(pathname, flags = {}) {
  if (pathname === '/ops-preview' && flags.opsPreview) return 'preview'
  if (pathname === '/ops' && flags.opsV2) return 'activo'
  return null
}
