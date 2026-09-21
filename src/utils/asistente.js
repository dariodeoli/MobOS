// ════════════════════════════════════════════════════════════════════
// ASISTENTE DE GANANCIAS (local, sin IA externa)
// Lee la pregunta del dueño en lenguaje natural, detecta el PERÍODO y el
// TEMA, y arma la respuesta calculándola con las funciones reales de
// calculos.js. Es instantáneo, gratis y funciona sin internet.
// ════════════════════════════════════════════════════════════════════
import {
  gs,
  num,
  calcularGanancia,
  productosGanadores,
  ventasDeRango,
  sumaPrecios,
  desdeDePeriodo,
  comisionDeVentas,
  totalesTienda,
  semaforo,
  ticketPromedio,
} from '@/utils/calculos'

const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

const tiene = (t, ...palabras) => palabras.some((p) => t.includes(p))

const PERIODO_LABEL = {
  dia: 'Hoy',
  semana: 'Esta semana',
  mes: 'Este mes',
  anio: 'Este año',
}

function detectarPeriodo(t) {
  if (tiene(t, 'hoy', 'dia de hoy', 'del dia')) return 'dia'
  if (tiene(t, 'semana')) return 'semana'
  if (tiene(t, 'anio', 'ano', 'año', 'anual')) return 'anio'
  if (tiene(t, 'mes', 'mensual')) return 'mes'
  return 'mes' // default razonable para análisis del dueño
}

// ── Respuestas por tema ─────────────────────────────────────────────
function respGanancia(periodo, data) {
  const g = calcularGanancia(periodo, data)
  const tono = g.ganancia > 0 ? 'bueno' : g.ganancia < 0 ? 'malo' : 'neutro'
  return {
    emoji: g.ganancia >= 0 ? '💰' : '⚠️',
    titulo: 'Ganancia neta',
    periodo: PERIODO_LABEL[periodo],
    filas: [
      { k: 'Ingresos por ventas', v: gs(g.ingresos) },
      { k: '− Costo de mercadería', v: gs(g.costoMercaderia) },
      { k: '− Gastos', v: gs(g.totalGastos) },
      { k: '− Publicidad (Meta Ads)', v: gs(g.totalAds) },
      { k: '= Ganancia neta', v: gs(g.ganancia), tono, fuerte: true },
    ],
    nota:
      g.ganancia > 0
        ? `Vas en azul. ${g.cantVentas} ventas en el período. 🚀`
        : g.ganancia < 0
          ? 'Estás en rojo: los costos y gastos superan a las ventas. Revisá gastos y márgenes.'
          : 'Estás en empate: cubrís costos pero todavía no hay ganancia.',
  }
}

function respIngresos(periodo, data) {
  const g = calcularGanancia(periodo, data)
  return {
    emoji: '🧾',
    titulo: 'Ventas / facturación',
    periodo: PERIODO_LABEL[periodo],
    filas: [
      { k: 'Total facturado', v: gs(g.ingresos), fuerte: true },
      { k: 'Cantidad de ventas', v: String(g.cantVentas) },
      { k: 'Ticket promedio', v: gs(ticketPromedio(g.ingresos, g.cantVentas)) },
    ],
    nota: g.cantVentas === 0 ? 'Todavía no hay ventas en este período.' : null,
  }
}

function respGastos(periodo, data) {
  const desde = desdeDePeriodo(periodo)
  const gastosP = data.gastos.filter((x) => x.fecha >= desde)
  const total = gastosP.reduce((a, x) => a + num(x.monto), 0)
  // Agrupado por categoría
  const porCat = {}
  gastosP.forEach((x) => {
    const c = x.categoria || 'Otros'
    porCat[c] = (porCat[c] || 0) + num(x.monto)
  })
  const lista = Object.entries(porCat)
    .sort((a, b) => b[1] - a[1])
    .map(([c, m]) => ({ izq: c, der: gs(m) }))
  return {
    emoji: '💸',
    titulo: 'Gastos',
    periodo: PERIODO_LABEL[periodo],
    filas: [
      { k: 'Total de gastos', v: gs(total), fuerte: true },
      { k: 'Cantidad de registros', v: String(gastosP.length) },
    ],
    lista: lista.length ? lista : null,
    listaTitulo: lista.length ? 'Por categoría' : null,
    nota: gastosP.length === 0 ? 'No cargaste gastos en este período.' : null,
  }
}

function respAds(periodo, data) {
  const desde = desdeDePeriodo(periodo)
  const adsP = data.ads.filter((x) => x.fecha >= desde)
  const totalAds = adsP.reduce((a, x) => a + num(x.monto), 0)
  const ingresos = sumaPrecios(ventasDeRango(data.ventas, desde))
  const roas = totalAds > 0 ? ingresos / totalAds : 0
  return {
    emoji: '📣',
    titulo: 'Publicidad (Meta Ads)',
    periodo: PERIODO_LABEL[periodo],
    filas: [
      { k: 'Invertido en ads', v: gs(totalAds), fuerte: true },
      { k: 'Ventas del período', v: gs(ingresos) },
      {
        k: 'Retorno (ventas ÷ ads)',
        v: totalAds > 0 ? roas.toFixed(1) + '×' : '—',
        tono: roas >= 1 ? 'bueno' : totalAds > 0 ? 'malo' : 'neutro',
      },
    ],
    nota:
      totalAds === 0
        ? 'No cargaste inversión en ads en este período.'
        : roas >= 1
          ? `Por cada ₲ en ads, entraron ₲ ${roas.toFixed(1)} en ventas. 👍`
          : 'El retorno es bajo: las ventas del período no cubren lo invertido en ads (ojo, puede haber ventas que no vengan de ads).',
  }
}

function respCosto(periodo, data) {
  const g = calcularGanancia(periodo, data)
  const margenBruto = g.ingresos - g.costoMercaderia
  return {
    emoji: '📦',
    titulo: 'Costo de mercadería',
    periodo: PERIODO_LABEL[periodo],
    filas: [
      { k: 'Ingresos por ventas', v: gs(g.ingresos) },
      { k: 'Costo de la mercadería vendida', v: gs(g.costoMercaderia) },
      {
        k: 'Margen bruto',
        v: gs(margenBruto),
        tono: margenBruto >= 0 ? 'bueno' : 'malo',
        fuerte: true,
      },
    ],
    nota:
      g.costoMercaderia === 0
        ? 'Ojo: el costo da 0. Cargá el costo de cada producto en Inventario para que este número sea real.'
        : null,
  }
}

function respComision(periodo, data) {
  const desde = desdeDePeriodo(periodo)
  const ventasP = ventasDeRango(data.ventas, desde)
  const totalCom = comisionDeVentas(ventasP, data.prodsById)
  const porVend = data.vendedores
    .map((vd) => {
      const vs = ventasP.filter((x) => x.vendedorId === vd.id)
      return { nombre: vd.nombre, com: comisionDeVentas(vs, data.prodsById) }
    })
    .filter((x) => x.com > 0)
    .sort((a, b) => b.com - a.com)
  return {
    emoji: '🤝',
    titulo: 'Comisiones de vendedores',
    periodo: PERIODO_LABEL[periodo],
    filas: [{ k: 'Total a pagar en comisiones', v: gs(totalCom), fuerte: true }],
    lista: porVend.length ? porVend.map((x) => ({ izq: x.nombre, der: gs(x.com) })) : null,
    listaTitulo: porVend.length ? 'Por vendedor' : null,
    nota:
      totalCom === 0 ? 'No hay comisiones (cargá la comisión por producto en Inventario).' : null,
  }
}

function respGanadores(periodo, data) {
  const top = productosGanadores(periodo, data.ventas, data.prodsById, 5)
  return {
    emoji: '🏆',
    titulo: 'Productos que más se venden',
    periodo: PERIODO_LABEL[periodo],
    filas: top.length
      ? [{ k: 'Producto estrella', v: top[0].nombre, fuerte: true }]
      : [{ k: 'Sin datos', v: '—' }],
    lista: top.map((p, i) => ({
      izq: `${i + 1}. ${p.nombre}`,
      der: `${p.cantidad}u · ${gs(p.monto)}`,
    })),
    listaTitulo: top.length ? 'Ranking del período' : null,
    nota: top.length === 0 ? 'Todavía no hay ventas en este período.' : null,
  }
}

function respCubrir(periodo, data) {
  const g = calcularGanancia(periodo, data)
  const margenBruto = g.ingresos - g.costoMercaderia
  const aCubrir = g.totalGastos + g.totalAds
  const falta = Math.max(0, aCubrir - margenBruto)
  return {
    emoji: falta > 0 ? '🎯' : '✅',
    titulo: 'Punto de equilibrio',
    periodo: PERIODO_LABEL[periodo],
    filas: [
      { k: 'Margen bruto (ventas − costo)', v: gs(margenBruto) },
      { k: 'Gastos + ads a cubrir', v: gs(aCubrir) },
      falta > 0
        ? { k: 'Te falta de margen para cubrir', v: gs(falta), tono: 'malo', fuerte: true }
        : {
            k: 'Ya cubriste todo, ganancia',
            v: gs(margenBruto - aCubrir),
            tono: 'bueno',
            fuerte: true,
          },
    ],
    nota:
      falta > 0
        ? 'Para llegar al equilibrio te falta ese margen. Vendé más o bajá gastos/ads.'
        : '¡Cubriste costos, gastos y publicidad! Lo que sigue es ganancia. 🎉',
  }
}

function respMeta(data) {
  const t = totalesTienda(data.ventas)
  const s = semaforo(t.hoy, t.ayer)
  const filas = [
    { k: 'Ventas de hoy', v: gs(t.hoy), fuerte: true },
    { k: 'Meta (ventas de ayer)', v: gs(s.meta) },
  ]
  if (s.estado === 'verde') {
    return {
      emoji: '🎉',
      titulo: 'Meta del día',
      periodo: 'Hoy',
      filas: [...filas, { k: 'Estado', v: 'Superada', tono: 'bueno', fuerte: true }],
      nota: '¡Hoy superaste lo de ayer! Seguí así. 🔥',
    }
  }
  if (s.estado === 'rojo') {
    return {
      emoji: '💪',
      titulo: 'Meta del día',
      periodo: 'Hoy',
      filas: [...filas, { k: 'Te falta', v: gs(s.falta), tono: 'malo', fuerte: true }],
      nota: 'Todavía no alcanzaste la meta de hoy. ¡Dale que se puede!',
    }
  }
  return {
    emoji: '🌅',
    titulo: 'Meta del día',
    periodo: 'Hoy',
    filas: [...filas, { k: 'Estado', v: 'Arrancando', tono: 'neutro' }],
    nota: 'Sin referencia de ayer todavía. La primera venta marca el camino.',
  }
}

function respVendedores(periodo, data) {
  const desde = desdeDePeriodo(periodo)
  const rank = data.vendedores
    .map((vd) => ({
      nombre: vd.nombre,
      total: sumaPrecios(ventasDeRango(data.ventas, desde, vd.id)),
    }))
    .sort((a, b) => b.total - a.total)
  return {
    emoji: '🧑‍💼',
    titulo: 'Ranking de vendedores',
    periodo: PERIODO_LABEL[periodo],
    filas: rank.length
      ? [{ k: 'Mejor vendedor', v: rank[0].nombre, fuerte: true }]
      : [{ k: 'Sin vendedores', v: '—' }],
    lista: rank.map((x, i) => ({ izq: `${i + 1}. ${x.nombre}`, der: gs(x.total) })),
    listaTitulo: rank.length ? 'Ventas del período' : null,
  }
}

function respPanorama(periodo, data) {
  const g = calcularGanancia(periodo, data)
  const top = productosGanadores(periodo, data.ventas, data.prodsById, 1)
  const tono = g.ganancia > 0 ? 'bueno' : g.ganancia < 0 ? 'malo' : 'neutro'
  return {
    emoji: '📊',
    titulo: 'Panorama del negocio',
    periodo: PERIODO_LABEL[periodo],
    filas: [
      { k: 'Ventas', v: gs(g.ingresos) },
      { k: 'Ganancia neta', v: gs(g.ganancia), tono, fuerte: true },
      { k: 'Gastos + ads', v: gs(g.totalGastos + g.totalAds) },
      { k: 'Producto estrella', v: top[0]?.nombre || '—' },
      { k: 'Cantidad de ventas', v: String(g.cantVentas) },
    ],
    nota: 'Probá preguntar por “ganancia de la semana”, “producto más vendido del mes” o “cuánto me falta para cubrir gastos”.',
  }
}

// ── Router principal ────────────────────────────────────────────────
// data = { ventas, gastos, ads, prodsById, vendedores }
export function responder(pregunta, data) {
  const t = norm(pregunta)
  const periodo = detectarPeriodo(t)

  // Orden importante: ads antes que "meta" (por "meta ads").
  if (tiene(t, 'cubrir', 'equilibrio', 'punto de', 'break', 'cubro', 'operativ'))
    return respCubrir(periodo, data)
  if (tiene(t, 'publicidad', 'ads', 'anuncio', 'marketing', 'meta ads', 'pauta'))
    return respAds(periodo, data)
  if (tiene(t, 'comision', 'comisiones')) return respComision(periodo, data)
  if (
    tiene(
      t,
      'ganador',
      'mas vendido',
      'mejor producto',
      'producto estrella',
      'top producto',
      'que se vende',
      'mas se vende',
    )
  )
    return respGanadores(periodo, data)
  if (tiene(t, 'vendedor', 'quien vende', 'ranking', 'mejor vendedor'))
    return respVendedores(periodo, data)
  if (tiene(t, 'meta', 'objetivo', 'semaforo', 'falta para la meta', 'voy con la meta'))
    return respMeta(data)
  if (tiene(t, 'gasto', 'gaste')) return respGastos(periodo, data)
  if (tiene(t, 'costo', 'mercaderia', 'margen bruto')) return respCosto(periodo, data)
  if (tiene(t, 'ganancia', 'gane', 'gano', 'rentab', 'utilidad', 'neto', 'plata'))
    return respGanancia(periodo, data)
  if (tiene(t, 'venta', 'vendi', 'factur', 'ingreso', 'cuanto vend', 'ticket'))
    return respIngresos(periodo, data)

  return respPanorama(periodo, data)
}

// Preguntas sugeridas (chips). q = texto que se envía al motor.
export const SUGERENCIAS = [
  { label: '💰 Ganancia del mes', q: 'cuánto gané este mes' },
  { label: '📈 Ganancia de la semana', q: 'cuánto gané esta semana' },
  { label: '🏆 Producto más vendido', q: 'producto más vendido del mes' },
  { label: '🎯 ¿Cubrí los gastos?', q: 'cuánto me falta para cubrir gastos este mes' },
  { label: '💸 Gastos del mes', q: 'cuánto gasté este mes' },
  { label: '📣 Retorno de ads', q: 'cómo va la publicidad este mes' },
  { label: '🤝 Comisiones', q: 'cuánto debo en comisiones este mes' },
  { label: '🧑‍💼 Mejor vendedor', q: 'ranking de vendedores del mes' },
]
