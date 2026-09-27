// A1 (#279) · Eventos de Web Push: los avisos del navegador salen de la misma
// información que la **bandeja interna** (centro de notificaciones del panel).
// Acá viven el catálogo de eventos, las derivaciones por usuario (espejo de
// `app/api/notifications/route.ts`, con las mismas ventanas y helpers) y el
// despacho con dedupe + métricas. El payload es genérico: nunca datos sensibles.
import type { FulfillmentStatus } from '@prisma/client'
import { prisma } from './prisma'
import { mencionadosEn, variantesDeNombre } from './menciones'
import { enviarWebPush } from './web-push'

const VENTANA_DIAS = 7
const ESTADOS_ENTREGA_LISTA: FulfillmentStatus[] = ['READY_FOR_PICKUP', 'READY_TO_SHIP']

export type EventoWebPush = {
  kind: string
  itemId: string
  url: string
  titulo: string
  cuerpo: string
}

/** Catálogo de eventos de A1. `pendiente` marca los que dependen de A4/A5. */
export const CATALOGO_WEB_PUSH: Record<string, { url: string; titulo: string; cuerpo: string; pendiente?: string }> = {
  MENCION: { url: '/pedidos', titulo: 'Te mencionaron en un pedido', cuerpo: 'Abrí MobOS para ver la mención.' },
  COTIZACION_APROBADA: { url: '/cotizaciones', titulo: 'Una cotización fue aprobada', cuerpo: 'Abrí MobOS para verla.' },
  INCIDENCIA: { url: '/recepcion', titulo: 'Hay una incidencia de recepción', cuerpo: 'Abrí MobOS para revisarla.' },
  PEDIDO_LISTO: { url: '/pedidos', titulo: 'Un pedido está listo', cuerpo: 'Abrí MobOS para verlo.' },
  ALTERNATIVA: { url: '/compras', titulo: 'Hay una alternativa propuesta', cuerpo: 'Abrí MobOS para decidirla.', pendiente: 'A5' },
  TRANSITO: { url: '/recepcion', titulo: 'Llegó un producto vendido en tránsito', cuerpo: 'Abrí MobOS para asignarlo.', pendiente: 'A4' },
}

/** Clave de dedupe (usuario + evento): un aviso por evento, nunca repetido. */
export function claveEnvio(kind: string, itemId: string) {
  return `${String(kind || '').slice(0, 40)}:${String(itemId || '').slice(0, 80)}`
}

const recorte = (texto: string | null | undefined, largo = 90) => String(texto || '').replace(/\s+/g, ' ').trim().slice(0, largo)

/**
 * Eventos del usuario en la ventana. Espejo de la bandeja interna para los
 * cuatro eventos de A1 que ya tienen fuente; ALTERNATIVA y TRANSITO se suman
 * cuando A5/A4 existan (sus módulos llaman a `despacharEventosWebPush`).
 */
export async function eventosDeUsuario({ tenantId, userId, ahora = new Date(), desde = new Date(ahora.getTime() - VENTANA_DIAS * 86_400_000) }: { tenantId: string; userId: string; ahora?: Date; desde?: Date }): Promise<EventoWebPush[]> {
  const eventos: EventoWebPush[] = []
  const usuario = await prisma.user.findFirst({ where: { id: userId, tenantId }, select: { id: true, name: true, role: true } })
  if (!usuario) return eventos

  // 1) Menciones en comentarios internos (mismo criterio que la bandeja).
  const variantes = variantesDeNombre(usuario.name)
  if (variantes.length) {
    const comentarios = await prisma.orderComment.findMany({
      where: { tenantId, createdAt: { gte: desde }, userId: { not: userId } },
      orderBy: { createdAt: 'desc' },
      take: 40,
      select: { id: true, body: true, orderId: true },
    })
    for (const comentario of comentarios) {
      if (!mencionadosEn(comentario.body, variantes).length) continue
      eventos.push({ kind: 'MENCION', itemId: `comentario-${comentario.id}`, ...CATALOGO_WEB_PUSH.MENCION, url: `/pedidos/${comentario.orderId}`, cuerpo: `Abrí MobOS para ver la mención en el pedido.` })
      if (eventos.filter((fila) => fila.kind === 'MENCION').length >= 5) break
    }
  }

  // 2) Cotización aprobada por el cliente (la cotización es del vendedor).
  const cotizaciones = await prisma.quote.findMany({ where: { tenantId, sellerId: userId, status: 'ACCEPTED', updatedAt: { gte: desde } }, orderBy: { updatedAt: 'desc' }, take: 5, select: { id: true } })
  for (const cotizacion of cotizaciones) eventos.push({ kind: 'COTIZACION_APROBADA', itemId: `cotizacion-${cotizacion.id}`, ...CATALOGO_WEB_PUSH.COTIZACION_APROBADA })

  // 3) Incidencia de recepción: avisa a quien administra la tienda.
  if (usuario.role === 'ADMIN') {
    const recepciones = await prisma.supplyReception.findMany({
      where: { tenantId, status: { in: ['CONFIRMADA', 'RECEPCION_PARCIAL'] }, receivedAt: { gte: desde }, items: { some: { resultado: { in: ['DANADO', 'INCORRECTO', 'FALTANTE', 'SOBRANTE'] } } } },
      orderBy: { receivedAt: 'desc' },
      take: 5,
      select: { id: true, shipment: { select: { code: true } } },
    })
    for (const recepcion of recepciones) eventos.push({ kind: 'INCIDENCIA', itemId: `recepcion-${recepcion.id}`, ...CATALOGO_WEB_PUSH.INCIDENCIA, url: '/recepcion', cuerpo: `Recepción ${recorte(recepcion.shipment?.code || '', 24)}: revisá la incidencia.` })
  }

  // 4) Pedido listo para retirar/enviar (el vendedor del pedido).
  const pedidos = await prisma.order.findMany({ where: { tenantId, sellerId: userId, fulfillmentStatus: { in: ESTADOS_ENTREGA_LISTA }, updatedAt: { gte: desde } }, orderBy: { updatedAt: 'desc' }, take: 5, select: { id: true, orderNumber: true, fulfillmentStatus: true } })
  for (const pedido of pedidos) eventos.push({ kind: 'PEDIDO_LISTO', itemId: `pedido-listo-${pedido.id}`, ...CATALOGO_WEB_PUSH.PEDIDO_LISTO, url: `/pedidos/${pedido.id}`, cuerpo: `${recorte(pedido.orderNumber || 'Pedido', 24)} ${pedido.fulfillmentStatus === 'READY_FOR_PICKUP' ? 'está listo para retirar' : 'está listo para enviar'}.` })

  return eventos
}

/**
 * Despacha los eventos nuevos del usuario: dedupe por `(userId, clave)` en
 * `WebPushEnvio` (un aviso por evento), silencio por dispositivo y poda de
 * endpoints muertos. Devuelve las métricas del despacho.
 */
export async function despacharEventosWebPush({ tenantId, userId, ahora = new Date() }: { tenantId: string; userId: string; ahora?: Date }) {
  const eventos = await eventosDeUsuario({ tenantId, userId, ahora })
  const metricas = { evaluados: eventos.length, nuevos: 0, enviados: 0, silenciados: 0, podados: 0 }
  if (!eventos.length) return metricas
  const yaEnviados = await prisma.webPushEnvio.findMany({ where: { userId, clave: { in: eventos.map((evento) => claveEnvio(evento.kind, evento.itemId)) } }, select: { clave: true } })
  const vistas = new Set(yaEnviados.map((fila) => fila.clave))
  for (const evento of eventos) {
    const clave = claveEnvio(evento.kind, evento.itemId)
    if (vistas.has(clave)) continue
    metricas.nuevos += 1
    const resultado = await enviarWebPush({ tenantId, userId, titulo: evento.titulo, cuerpo: evento.cuerpo, url: evento.url, tag: clave, ahora })
    const enviado = Number(resultado.enviados || 0)
    const silenciado = Number(resultado.silenciados || 0)
    const podado = Number(resultado.podados || 0)
    metricas.enviados += enviado
    metricas.silenciados += silenciado
    metricas.podados += podado
    const estado = !resultado.configurado ? 'sin-configurar' : enviado > 0 ? 'enviado' : silenciado > 0 ? 'silenciado' : podado > 0 ? 'podado' : 'sin-dispositivo'
    await prisma.webPushEnvio.create({ data: { tenantId, userId, clave, kind: evento.kind, url: evento.url, resultado: estado, enviados: enviado, silenciados: silenciado, podados: podado } }).catch(() => {})
  }
  return metricas
}

/** Despacha para todos los usuarios con al menos una suscripción (cron). */
export async function despacharEventosDeTodos({ tenantId, ahora = new Date(), limite = 200 }: { tenantId?: string; ahora?: Date; limite?: number }) {
  const usuarios = await prisma.webPushSubscription.findMany({ where: tenantId ? { tenantId } : {}, distinct: ['userId'], select: { tenantId: true, userId: true }, take: limite })
  const resumen = { usuarios: usuarios.length, nuevos: 0, enviados: 0, silenciados: 0, podados: 0 }
  for (const fila of usuarios) {
    const metricas = await despacharEventosWebPush({ tenantId: fila.tenantId, userId: fila.userId, ahora })
    resumen.nuevos += metricas.nuevos
    resumen.enviados += metricas.enviados
    resumen.silenciados += metricas.silenciados
    resumen.podados += metricas.podados
  }
  return resumen
}

/** Métricas de la ventana (días) para el tenant y, si se pide, por usuario. */
export async function metricasWebPush({ tenantId, userId = null, dias = 7, ahora = new Date() }: { tenantId: string; userId?: string | null; dias?: number; ahora?: Date }) {
  const desde = new Date(ahora.getTime() - Math.max(1, Math.min(90, dias)) * 86_400_000)
  const filas = await prisma.webPushEnvio.groupBy({ by: ['resultado'], where: { tenantId, ...(userId ? { userId } : {}), createdAt: { gte: desde } }, _count: { _all: true }, _sum: { enviados: true, silenciados: true, podados: true } })
  const resumen = { eventos: 0, enviados: 0, silenciados: 0, podados: 0, porResultado: {} as Record<string, number> }
  for (const fila of filas) {
    const total = Number(fila._count._all || 0)
    resumen.eventos += total
    resumen.enviados += Number(fila._sum.enviados || 0)
    resumen.silenciados += Number(fila._sum.silenciados || 0)
    resumen.podados += Number(fila._sum.podados || 0)
    resumen.porResultado[fila.resultado] = total
  }
  return { desde: desde.toISOString(), dias, ...resumen }
}
