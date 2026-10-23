// Presentación del cobro del POS sin JSX (testeable): agrupa las cuentas de
// cobro en las tarjetas de medio («Efectivo», «Transferencia»…), ordena las
// cuentas con las usadas hace poco primero y calcula los montos rápidos.
// No toca montos ni payload: solo decide qué se ofrece y con qué valor.

import { demoSessionActive } from '../lib/demoMode.js'

export const GRUPOS_MEDIO = [
  { id: 'CASH', label: 'Efectivo', icono: 'money' },
  { id: 'TRANSFER', label: 'Transferencia', icono: 'bank' },
  { id: 'CARD', label: 'Tarjeta', icono: 'card' },
  { id: 'PIX', label: 'PIX', icono: 'qr' },
  { id: 'CRYPTO', label: 'USDT', icono: 'wallet' },
  { id: 'TRADE_IN', label: 'Canje', icono: 'refresh' },
]

const MONEDAS_COBRO = ['PYG', 'USD', 'BRL']
const CLAVE_RECIENTES = 'mobos:cuentas-cobro-recientes'
const MAX_RECIENTES = 8

/** Cuentas que se pueden cobrar hoy: activas y en una moneda de cobro. */
export const cuentasCobrables = (cuentas) => (cuentas || []).filter(c => c?.isActive && MONEDAS_COBRO.includes(c.currency))

/** Ordena las cuentas: las recientes primero (más nueva primero), después por nombre. */
export function ordenarPorRecientes(cuentas, recientes = []) {
  const lugar = (id) => { const i = recientes.indexOf(id); return i < 0 ? Infinity : i }
  return [...(cuentas || [])].sort((a, b) => lugar(a.id) - lugar(b.id) || String(a.name || '').localeCompare(String(b.name || ''), 'es'))
}

const ETIQUETA_MONEDA = { USD: 'US$', BRL: 'R$' }

/**
 * Un grupo por medio que tenga cuentas cobrables, con sus cuentas ya ordenadas.
 * El efectivo en moneda extranjera tiene su propia tarjeta («Efectivo US$»)
 * porque pide cotización; el efectivo en guaraníes es «Efectivo».
 */
export function gruposDeCuentas(cuentas, recientes = []) {
  const cobrables = cuentasCobrables(cuentas)
  const grupos = []
  for (const grupo of GRUPOS_MEDIO) {
    const delMedio = cobrables.filter(c => c.kind === grupo.id)
    if (grupo.id !== 'CASH') {
      if (delMedio.length) grupos.push({ ...grupo, cuentas: ordenarPorRecientes(delMedio, recientes) })
      continue
    }
    const gs = delMedio.filter(c => c.currency === 'PYG')
    if (gs.length) grupos.push({ ...grupo, cuentas: ordenarPorRecientes(gs, recientes) })
    for (const moneda of ['USD', 'BRL']) {
      const ext = delMedio.filter(c => c.currency === moneda)
      if (ext.length) grupos.push({ ...grupo, id: `CASH-${moneda}`, kind: 'CASH', label: `Efectivo ${ETIQUETA_MONEDA[moneda]}`, cuentas: ordenarPorRecientes(ext, recientes) })
    }
  }
  return grupos.map(g => ({ kind: g.id, ...g }))
}

/** Cuenta que se elige sola al tocar el medio; null si hay que preguntar. */
export function cuentaDirecta(grupo) {
  if (!grupo?.cuentas?.length) return null
  if (grupo.cuentas.length === 1) return grupo.cuentas[0]
  return null
}

export function recientesGuardados() {
  try {
    const lista = JSON.parse(globalThis.localStorage?.getItem(CLAVE_RECIENTES) || '[]')
    return Array.isArray(lista) ? lista.filter(x => typeof x === 'string') : []
  } catch { return [] }
}

export function recordarCuentaReciente(id) {
  // La demo no deja nada en el navegador (ni siquiera esta comodidad).
  if (!id || demoSessionActive()) return
  try {
    const resto = recientesGuardados().filter(x => x !== id)
    globalThis.localStorage?.setItem(CLAVE_RECIENTES, JSON.stringify([id, ...resto].slice(0, MAX_RECIENTES)))
  } catch { /* sin almacenamiento: el orden por recientes es solo comodidad */ }
}

const subirA = (n, paso) => Math.ceil(n / paso) * paso

/** Ancho (en ch) de un campo de monto según lo escrito: ni gigante ni cortado. */
export function anchoMonto(valor, decimales = false) {
  const digitos = String(valor ?? '').replace(/[^\d.,]/g, '').length
  const miles = decimales ? 0 : Math.floor(Math.max(0, digitos - 1) / 3)
  const largo = digitos + miles + (decimales ? 3 : 0)
  // Inter real con cifras tabulares: cada carácter pesa más que el «0» de `ch`
  // y el prefijo «Gs.» come ~48px; por eso 1,15ch por carácter + 9ch de reserva.
  return `${Math.min(32, Math.max(14, Math.ceil(largo * 1.15) + 9))}ch`
}

/**
 * Montos rápidos para el pago vigente (en guaraníes).
 * - `disponible`: lo que ese pago puede cubrir (lo que falta + lo que ya tiene).
 * - Chips de MONTO del pago: saldo y mitad.
 * - Efectivo en Gs: además chips de lo RECIBIDO (exacto y redondeos hacia arriba).
 */
export function montosRapidos({ efectivoGs = false, disponible = 0, monto = 0 }) {
  const base = Math.max(0, Math.round(Number(disponible) || 0))
  const chips = []
  if (base > 0) {
    chips.push({ clave: 'saldo', etiqueta: 'Saldo', valor: base, tipo: 'monto' })
    const mitad = Math.round(base / 2)
    if (mitad > 0 && mitad < base) chips.push({ clave: 'mitad', etiqueta: 'Mitad', valor: mitad, tipo: 'monto' })
  }
  const aplicado = Math.max(0, Math.round(Number(monto) || 0))
  if (efectivoGs && aplicado > 0) {
    const valores = [aplicado, subirA(aplicado, 50000), subirA(aplicado, 100000), subirA(aplicado, 500000)]
    ;[...new Set(valores)].forEach((valor, i) => chips.push({ clave: i === 0 ? 'exacto' : `r${valor}`, etiqueta: i === 0 ? 'Exacto' : valor.toLocaleString('es-PY'), valor, tipo: 'recibido' }))
  }
  return chips
}

