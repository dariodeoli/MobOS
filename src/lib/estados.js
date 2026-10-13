// Mapa único de estados visibles (docs/PANTALLAS.md regla 10). Cada estado
// tiene etiqueta y uno de cuatro tonos: ok · warn · bad · neutral. El
// `StatusChip` lee este archivo; las pantallas no inventan colores ni textos.
// Los dominios que ya tenían su mapa (pedido, entrega, garantía, servicio) se
// derivan de él: una sola fuente, sin copiar etiquetas.
import { ESTADO_ENTREGA_BADGE, ESTADO_GARANTIA_BADGE, ESTADO_PEDIDO_BADGE } from './estadosPedido.js'
import { ESTADOS_SERVICIO } from './estadosServicio.js'

export const TONOS_ESTADO = ['ok', 'warn', 'bad', 'neutral']

const TONO_DE_COLOR = { green: 'ok', orange: 'warn', yellow: 'warn', red: 'bad', blue: 'neutral', slate: 'neutral' }
const desdeBadge = (mapa) => Object.fromEntries(Object.entries(mapa).map(([clave, { label, color }]) => [clave, { label, tono: TONO_DE_COLOR[color] || 'neutral' }]))

export const ESTADOS = {
  pedido: desdeBadge(ESTADO_PEDIDO_BADGE),
  entrega: desdeBadge(ESTADO_ENTREGA_BADGE),
  garantia: desdeBadge(ESTADO_GARANTIA_BADGE),
  servicio: Object.fromEntries(ESTADOS_SERVICIO.map(([id, label, color]) => [id, { label, tono: TONO_DE_COLOR[color] || 'neutral' }])),
  // Estados genéricos de dinero y conciliación (Finanzas, Compras, Caja).
  general: {
    PAGADO: { label: 'Pagado', tono: 'ok' },
    COBRADO: { label: 'Cobrado', tono: 'ok' },
    CONCILIADO: { label: 'Conciliado', tono: 'ok' },
    APROBADO: { label: 'Aprobado', tono: 'ok' },
    RECIBIDO: { label: 'Recibido', tono: 'ok' },
    ACTIVO: { label: 'Activo', tono: 'ok' },
    PENDIENTE: { label: 'Pendiente', tono: 'warn' },
    PARCIAL: { label: 'Parcial', tono: 'warn' },
    POR_COBRAR: { label: 'Por cobrar', tono: 'warn' },
    POR_APROBAR: { label: 'Por aprobar', tono: 'warn' },
    EN_REVISION: { label: 'En revisión', tono: 'warn' },
    DIFERENCIA: { label: 'Con diferencia', tono: 'bad' },
    VENCIDO: { label: 'Vencido', tono: 'bad' },
    RECHAZADO: { label: 'Rechazado', tono: 'bad' },
    ANULADO: { label: 'Anulado', tono: 'bad' },
    BORRADOR: { label: 'Borrador', tono: 'neutral' },
    CERRADO: { label: 'Cerrado', tono: 'neutral' },
    INACTIVO: { label: 'Inactivo', tono: 'neutral' },
  },
}

const normalizar = (valor) => String(valor ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().replace(/[\s-]+/g, '_').toUpperCase()

// Resuelve {label, tono} de un estado. Tolera mayúsculas, acentos y espacios;
// un estado desconocido se muestra tal cual en tono neutral (nunca rompe).
export function estadoInfo(estado, dominio = 'general') {
  const clave = normalizar(estado)
  const info = ESTADOS[dominio]?.[clave] || ESTADOS.general[clave]
  if (info) return info
  return { label: estado == null || estado === '' ? '—' : String(estado), tono: 'neutral' }
}
