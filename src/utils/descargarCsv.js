import { apiFetch } from '@/lib/api/client'
import { descargarArchivo } from '@/utils/descargarArchivo'

// Descarga un CSV de /api/exports/<módulo> con la sesión de cookies. El nombre
// del archivo lo elige quien llama: entre orígenes distintos el navegador no
// expone Content-Disposition, así que no se puede leer del encabezado.
export async function descargarCsv(modulo, filtros = {}, nombreArchivo) {
  const params = new URLSearchParams()
  for (const [clave, valor] of Object.entries(filtros)) {
    if (valor === undefined || valor === null || valor === '') continue
    params.set(clave, String(valor))
  }
  const consulta = params.toString()
  const response = await apiFetch(`/api/exports/${encodeURIComponent(modulo)}${consulta ? `?${consulta}` : ''}`)
  if (!response.ok) {
    let mensaje = 'No se pudo exportar el CSV.'
    try {
      const payload = await response.json()
      if (payload?.message) mensaje = payload.message
    } catch { /* la respuesta de error no traía JSON */ }
    throw new Error(mensaje)
  }
  const blob = await response.blob()
  descargarArchivo(nombreArchivo || `mobos-${modulo}.csv`, blob)
}
