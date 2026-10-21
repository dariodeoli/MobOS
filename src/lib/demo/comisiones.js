// Comisiones de la demo (Finanzas → Comisiones): reglas y liquidaciones en
// memoria de la pestaña, con la misma forma que `/api/commission-rules` y
// `/api/commission-settlements`. Las líneas de cada liquidación salen de las
// ventas ficticias del vendedor en el período (comisión sobre el margen), y los
// cortes sembrados son relativos a «hoy». Sin red ni servicios externos.
import { listVentas } from '@/lib/storage'
import { EQUIPO_DEMO } from '@/lib/demo/iphones.js'
import { diaDemo, instanteDemo } from '@/lib/demo/reloj.js'

let reglas = null
let liquidaciones = null
let secuencia = 0

const usuarios = () => EQUIPO_DEMO.map((persona) => ({ id: persona.id, name: persona.nombre, email: persona.email, role: persona.rol, status: 'ACTIVE' }))
const nombreDe = (id) => EQUIPO_DEMO.find((persona) => persona.id === id)?.nombre || 'Vendedor'
const sumarDias = (clave, dias) => new Date(Date.parse(`${clave}T00:00:00Z`) + dias * 86400000).toISOString().slice(0, 10)

function porcentajeDe(sellerId) {
  const persona = EQUIPO_DEMO.find((item) => item.id === sellerId)
  const regla = reglas.find((item) => item.userId === sellerId) || reglas.find((item) => item.role === persona?.rol)
  return regla ? Number(regla.percentPyg) : 0
}

function armar(sellerId, from, to, extra = {}) {
  const pct = porcentajeDe(sellerId)
  const lines = listVentas()
    .filter((venta) => venta.vendedorId === sellerId && venta.fecha >= from && venta.fecha <= to)
    .map((venta) => {
      const base = Math.max(0, Math.round(Number(venta.precio || 0) - Number(venta.precioCosto || 0)))
      return { orderNumber: venta.orderNumber || venta.numero, date: venta.fecha, basePyg: base, commissionPyg: Math.round((base * pct) / 100) }
    })
    .filter((linea) => linea.basePyg > 0)
  const marginPyg = lines.reduce((suma, linea) => suma + linea.basePyg, 0)
  secuencia += 1
  return {
    id: extra.id || `demo-liq-${secuencia}`,
    sellerId,
    sellerName: nombreDe(sellerId),
    periodFrom: from,
    periodTo: to,
    commissionPct: pct,
    status: 'DRAFT',
    marginPyg,
    totalPyg: lines.reduce((suma, linea) => suma + linea.commissionPyg, 0),
    lines,
    createdAt: new Date().toISOString(),
    ...extra,
  }
}

function iniciar() {
  if (reglas) return
  reglas = [
    { id: 'demo-regla-1', userId: 'demo-user-vendedor', role: null, percentPyg: 6, user: { name: nombreDe('demo-user-vendedor') } },
    { id: 'demo-regla-2', userId: 'demo-user-vendedora', role: null, percentPyg: 5.5, user: { name: nombreDe('demo-user-vendedora') } },
    { id: 'demo-regla-3', userId: 'demo-user-gerente', role: null, percentPyg: 3, user: { name: nombreDe('demo-user-gerente') } },
    { id: 'demo-regla-4', userId: null, role: 'CAJERA', percentPyg: 1.5, user: null },
  ]
  liquidaciones = []
  const hoy = diaDemo(0)
  const inicioMes = `${hoy.slice(0, 8)}01`
  const finMesPrevio = sumarDias(inicioMes, -1)
  const inicioMesPrevio = `${finMesPrevio.slice(0, 8)}01`
  const inicioAnterior = `${sumarDias(inicioMesPrevio, -1).slice(0, 8)}01`
  const finAnterior = sumarDias(inicioMesPrevio, -1)
  liquidaciones.push(armar('demo-user-vendedor', inicioAnterior, finAnterior, { id: 'demo-liq-a', status: 'PAID', paidAt: instanteDemo(22), createdAt: instanteDemo(24, 9) }))
  liquidaciones.push(armar('demo-user-vendedor', inicioMesPrevio, finMesPrevio, { id: 'demo-liq-b', status: 'PAID', paidAt: instanteDemo(3), createdAt: instanteDemo(6, 9) }))
  liquidaciones.push(armar('demo-user-vendedora', inicioMesPrevio, finMesPrevio, { id: 'demo-liq-c', status: 'DRAFT', createdAt: instanteDemo(4, 9) }))
  liquidaciones = liquidaciones.filter((item) => item.lines.length > 0)
}

const sinLineas = ({ lines, ...resto }) => ({ ...resto, lineCount: lines.length })

/** Reemplazo de `api` para la pantalla de comisiones: mismos verbos y rutas. */
export const apiComisionesDemo = {
  async get(ruta) {
    iniciar()
    if (ruta.startsWith('/api/commission-rules')) return reglas.map((regla) => ({ ...regla }))
    if (ruta.startsWith('/api/users')) return usuarios()
    const detalle = ruta.match(/^\/api\/commission-settlements\/([^?]+)/)
    if (detalle) return { ...liquidaciones.find((item) => item.id === decodeURIComponent(detalle[1])) }
    const vendedor = ruta.match(/sellerId=([^&]+)/)
    const lista = vendedor ? liquidaciones.filter((item) => item.sellerId === decodeURIComponent(vendedor[1])) : liquidaciones
    return lista.map(sinLineas)
  },
  async post(ruta, cuerpo = {}) {
    iniciar()
    if (ruta.startsWith('/api/commission-rules')) {
      const persona = EQUIPO_DEMO.find((item) => item.id === cuerpo.userId)
      const regla = { id: `demo-regla-${Date.now().toString(36)}`, userId: cuerpo.userId || null, role: null, percentPyg: Number(cuerpo.percentPyg) || 0, user: persona ? { name: persona.nombre } : null }
      reglas = [regla, ...reglas]
      return regla
    }
    const solapa = liquidaciones.some((item) => item.sellerId === cuerpo.sellerId && item.status !== 'CANCELLED' && item.periodFrom <= cuerpo.to && item.periodTo >= cuerpo.from)
    if (solapa) throw new Error('El período se superpone con una liquidación vigente de este vendedor.')
    const nueva = armar(cuerpo.sellerId, cuerpo.from, cuerpo.to, { verificationToken: `demo${Math.random().toString(16).slice(2, 18)}` })
    liquidaciones = [nueva, ...liquidaciones]
    return nueva
  },
  async patch(ruta, cuerpo = {}) {
    iniciar()
    if (ruta.startsWith('/api/commission-rules')) {
      reglas = reglas.map((regla) => (regla.id === cuerpo.id ? { ...regla, percentPyg: Number(cuerpo.percentPyg) || 0 } : regla))
      return reglas.find((regla) => regla.id === cuerpo.id)
    }
    const id = decodeURIComponent(ruta.match(/^\/api\/commission-settlements\/([^?]+)/)?.[1] || '')
    liquidaciones = liquidaciones.map((item) => {
      if (item.id !== id) return item
      if (cuerpo.action === 'pay') return { ...item, status: 'PAID', paidAt: new Date().toISOString() }
      if (cuerpo.action === 'cancel') return { ...item, status: 'CANCELLED' }
      if (cuerpo.action === 'rotate') return { ...item, verificationToken: `demo${Math.random().toString(16).slice(2, 18)}` }
      return item
    })
    return { ...liquidaciones.find((item) => item.id === id) }
  },
  async delete(ruta, opciones = {}) {
    iniciar()
    reglas = reglas.filter((regla) => regla.id !== opciones.body?.id)
    return { ok: true }
  },
}
