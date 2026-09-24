// Flags del rediseño v2 (#241): la vista previa y la activación de F3 se
// controlan por entorno y nada se activa por defecto.
//
// - `VITE_OPS_PREVIEW=1`: habilita `/ops-preview` (además de desarrollo).
// - `VITE_OPS_V2`: la ruta real `/ops` quedó **activa desde la aprobación del
//   rollout** (paso 3); `VITE_OPS_V2=0` es la salida de emergencia sin tocar
//   código.
export const esFlag = (valor) => String(valor ?? '').trim() === '1'

export function flagsV2({ dev = false, env = {} } = {}) {
  const apagado = String(env.VITE_OPS_V2 ?? '').trim() === '0'
  return {
    // Activo por defecto (rollout aprobado); apagable con VITE_OPS_V2=0.
    opsV2: !apagado,
    // La vista previa con datos ficticios sigue disponible en desarrollo o con
    // su flag.
    opsPreview: Boolean(dev) || esFlag(env.VITE_OPS_PREVIEW),
  }
}

/** Qué vista v2 corresponde a la ruta actual ('preview', 'activo' o null). */
export function rutaV2(pathname, flags = {}) {
  if (pathname === '/ops-preview' && flags.opsPreview) return 'preview'
  if (pathname === '/ops' && flags.opsV2) return 'activo'
  return null
}
