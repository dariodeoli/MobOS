// Utilidades del kardex por producto (#106). El rango se arma con los límites
// del día local: el backend recibe ISO completo y no adivina la zona horaria.
// Módulo puro (sin acceso a la API) para poder testearlo con node --test.

export function extremosDelRango(desde, hasta) {
  const inicio = desde ? new Date(`${desde}T00:00:00`) : null
  const fin = hasta ? new Date(`${hasta}T23:59:59.999`) : null
  return {
    desde: inicio && !Number.isNaN(inicio.getTime()) ? inicio.toISOString() : undefined,
    hasta: fin && !Number.isNaN(fin.getTime()) ? fin.toISOString() : undefined,
  }
}

export function consultaKardex(productId, rango = {}, extra = {}) {
  const params = new URLSearchParams()
  for (const [clave, valor] of Object.entries({ ...rango, ...extra })) {
    if (valor === undefined || valor === null || valor === '') continue
    params.set(clave, String(valor))
  }
  const consulta = params.toString()
  return `/api/products/${encodeURIComponent(productId)}/kardex${consulta ? `?${consulta}` : ''}`
}

// Descarga el CSV del mismo rango que se está viendo. El fetch vive en el
// componente para que este módulo no dependa de la API (así se puede testear).
export const FECHA_KARDEX = (valor) => {
  if (!valor) return '—'
  const fecha = new Date(valor)
  if (Number.isNaN(fecha.getTime())) return '—'
  const hoy = new Date()
  const mismoAnio = fecha.getFullYear() === hoy.getFullYear()
  return fecha.toLocaleString('es-PY', { day: '2-digit', month: 'short', ...(mismoAnio ? {} : { year: 'numeric' }), hour: '2-digit', minute: '2-digit' })
}
