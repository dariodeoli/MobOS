// Cotización de referencia del dólar (BCP y casas de cambio) para precargar los
// campos de costo en moneda extranjera. Se pide una vez por pestaña y siempre
// queda editable a mano: si el proveedor no responde, se devuelve null.
import { api } from '@/lib/api/client'

let cache = null
let enCurso = null

export async function cotizacionReferencia() {
  if (cache !== null) return cache
  if (!enCurso) {
    enCurso = api
      .get('/api/fx')
      .then((data) => {
        const valor = Number(data?.referencialDiario) || Number(data?.venta) || Number(data?.compra) || null
        cache = valor
        return valor
      })
      .catch(() => {
        cache = null
        return null
      })
      .finally(() => { enCurso = null })
  }
  return enCurso
}
