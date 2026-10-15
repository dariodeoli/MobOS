import { Prisma } from '@prisma/client'
import { prisma } from '../prisma'
import { diaSql, kpi, num, type FilaDia, type Kpi } from './consultas'
import { ZONA, rangoDePeriodo, rellenarSerie, variacionPct, type Periodo } from './rangos'
import { BUCKETS_SCROLL, porcentaje } from '../site-events'

// «Tráfico y demo»: medición propia del sitio público (landing) y del uso de la
// demo, desde SiteEvent. Es una sección aparte: NO se mezcla con los KPIs del
// negocio (que excluyen las demos) y no toca tablas de empresas. Solo
// agregados SQL parametrizados, días en hora de Paraguay.
const N = (valor: unknown) => Number(valor ?? 0)

function kpiPromedio(base: { clave: string; etiqueta: string; fuente: string }, filas: { dia: string; valor: number | null }[], dias: string[], diasPrevios: string[], actual: number | null, previo: number | null): Kpi {
  const porDia = filas.map(f => ({ dia: String(f.dia), valor: N(f.valor) }))
  return {
    ...base, unidad: 'segundos', actual: actual ?? 0, previo: previo ?? 0,
    variacion: actual !== null && previo !== null ? variacionPct(actual, previo) : null,
    serie: rellenarSerie(porDia, dias), seriePrevia: rellenarSerie(porDia, diasPrevios),
  }
}

type Ranking = { clave: string; n: number; porcentaje: number | null }
const ranking = (filas: { clave: string | null; n: bigint | number }[]): Ranking[] => {
  const total = filas.reduce((a, f) => a + N(f.n), 0)
  return filas.map(f => ({ clave: f.clave ?? '(sin dato)', n: N(f.n), porcentaje: porcentaje(N(f.n), total) }))
}

export async function traficoYDemo(periodo: Periodo, ahora = new Date()) {
  const r = rangoDePeriodo(periodo, ahora)
  const desde = r.desde, hasta = r.hasta, pDesde = r.previoDesde, pHasta = r.previoHasta
  const enPeriodo = Prisma.sql`"createdAt" >= ${desde} AND "createdAt" < ${hasta}`
  const L = Prisma.sql`"kind" = 'landing'`
  const D = Prisma.sql`"kind" = 'demo'`
  const todo = Prisma.sql`"createdAt" >= ${pDesde} AND "createdAt" < ${hasta}`

  const [visitasDia, visitantesDia, escalares, scroll, paginas, fuentes, dispositivos, iniciosDia, demoEscalares, duracionDia, roles, modulos, conversion] = await Promise.all([
    prisma.$queryRaw<FilaDia[]>(Prisma.sql`SELECT ${diaSql('"createdAt"')} AS dia, COUNT(*)::int AS valor FROM "SiteEvent" WHERE ${L} AND "name" = 'pageview' AND ${todo} GROUP BY 1`),
    prisma.$queryRaw<FilaDia[]>(Prisma.sql`SELECT ${diaSql('"createdAt"')} AS dia, COUNT(DISTINCT "visitorId")::int AS valor FROM "SiteEvent" WHERE ${L} AND "name" = 'pageview' AND ${todo} GROUP BY 1`),
    prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT
        COUNT(DISTINCT "visitorId") FILTER (WHERE "name" = 'pageview' AND "createdAt" >= ${desde} AND "createdAt" < ${hasta})::int AS visitantes,
        COUNT(DISTINCT "visitorId") FILTER (WHERE "name" = 'pageview' AND "createdAt" >= ${pDesde} AND "createdAt" < ${pHasta})::int AS "visitantesPrevio",
        AVG("durationSec") FILTER (WHERE "name" = 'engage' AND "createdAt" >= ${desde} AND "createdAt" < ${hasta})::float8 AS tiempo,
        AVG("durationSec") FILTER (WHERE "name" = 'engage' AND "createdAt" >= ${pDesde} AND "createdAt" < ${pHasta})::float8 AS "tiempoPrevio",
        AVG("scrollPct") FILTER (WHERE "name" = 'engage' AND "createdAt" >= ${desde} AND "createdAt" < ${hasta})::float8 AS scroll,
        AVG("scrollPct") FILTER (WHERE "name" = 'engage' AND "createdAt" >= ${pDesde} AND "createdAt" < ${pHasta})::float8 AS "scrollPrevio"
      FROM "SiteEvent" WHERE ${L} AND ${todo}`),
    prisma.$queryRaw<{ clave: string; n: number }[]>(Prisma.sql`SELECT "scrollPct"::text AS clave, COUNT(*)::int AS n FROM "SiteEvent" WHERE ${L} AND "name" = 'engage' AND "scrollPct" IS NOT NULL AND ${enPeriodo} GROUP BY 1`),
    prisma.$queryRaw<{ clave: string; n: number }[]>(Prisma.sql`SELECT COALESCE("path", '(sin ruta)') AS clave, COUNT(*)::int AS n FROM "SiteEvent" WHERE ${L} AND "name" = 'pageview' AND ${enPeriodo} GROUP BY 1 ORDER BY n DESC, 1 LIMIT 8`),
    prisma.$queryRaw<{ clave: string; n: number }[]>(Prisma.sql`SELECT COALESCE(NULLIF("utmSource", ''), "referrer", 'directo') AS clave, COUNT(*)::int AS n FROM "SiteEvent" WHERE ${L} AND "name" = 'pageview' AND ${enPeriodo} GROUP BY 1 ORDER BY n DESC, 1 LIMIT 8`),
    prisma.$queryRaw<{ clave: string; n: number }[]>(Prisma.sql`SELECT "device" AS clave, COUNT(*)::int AS n FROM "SiteEvent" WHERE ${L} AND "name" = 'pageview' AND ${enPeriodo} GROUP BY 1 ORDER BY n DESC`),
    prisma.$queryRaw<FilaDia[]>(Prisma.sql`SELECT ${diaSql('"createdAt"')} AS dia, COUNT(*)::int AS valor FROM "SiteEvent" WHERE ${D} AND "name" = 'demo_start' AND ${todo} GROUP BY 1`),
    prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT
        COUNT(DISTINCT "visitorId") FILTER (WHERE "name" = 'demo_start' AND "createdAt" >= ${desde} AND "createdAt" < ${hasta})::int AS visitantes,
        COUNT(DISTINCT "visitorId") FILTER (WHERE "name" = 'demo_start' AND "createdAt" >= ${pDesde} AND "createdAt" < ${pHasta})::int AS "visitantesPrevio",
        AVG("durationSec") FILTER (WHERE "name" = 'demo_end' AND "createdAt" >= ${desde} AND "createdAt" < ${hasta})::float8 AS duracion,
        AVG("durationSec") FILTER (WHERE "name" = 'demo_end' AND "createdAt" >= ${pDesde} AND "createdAt" < ${pHasta})::float8 AS "duracionPrevia"
      FROM "SiteEvent" WHERE ${D} AND ${todo}`),
    prisma.$queryRaw<{ dia: string; valor: number | null }[]>(Prisma.sql`SELECT ${diaSql('"createdAt"')} AS dia, AVG("durationSec")::float8 AS valor FROM "SiteEvent" WHERE ${D} AND "name" = 'demo_end' AND ${todo} GROUP BY 1`),
    prisma.$queryRaw<{ clave: string; n: number }[]>(Prisma.sql`SELECT "role" AS clave, COUNT(*)::int AS n FROM "SiteEvent" WHERE ${D} AND "name" = 'demo_start' AND ${enPeriodo} GROUP BY 1 ORDER BY n DESC, 1`),
    prisma.$queryRaw<{ clave: string; n: number }[]>(Prisma.sql`SELECT "module" AS clave, COUNT(*)::int AS n FROM "SiteEvent" WHERE ${D} AND "name" = 'demo_view' AND "module" IS NOT NULL AND ${enPeriodo} GROUP BY 1 ORDER BY n DESC, 1 LIMIT 10`),
    prisma.$queryRaw<{ visitantes: number; convertidos: number }[]>(Prisma.sql`
      WITH d AS (SELECT "visitorId", MIN("createdAt") AS primero FROM "SiteEvent" WHERE ${D} AND "name" = 'demo_start' AND ${enPeriodo} GROUP BY 1)
      SELECT COUNT(*)::int AS visitantes,
             COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM "SiteEvent" c WHERE c."visitorId" = d."visitorId" AND c."name" = 'cta_registro' AND c."createdAt" >= d.primero AND c."createdAt" < ${hasta}))::int AS convertidos
      FROM d`),
  ])

  const e = escalares[0] ?? {}
  const base = (clave: string, etiqueta: string, fuente: string) => ({ clave, etiqueta, unidad: 'cantidad' as const, fuente })
  const visitas = kpi(base('visitas', 'Visitas a la landing', 'Sitio · SiteEvent pageview (una por carga de página), por día de Paraguay. Sin bots ni visitantes con DNT.'), visitasDia, r.dias, r.diasPrevios)
  const unicos = kpi(base('visitantes', 'Visitantes únicos', 'Sitio · visitantes distintos (id anónimo del navegador) con pageview; la curva cuenta distintos por día.'), visitantesDia, r.dias, r.diasPrevios)
  unicos.actual = N(e.visitantes); unicos.previo = N(e.visitantesPrevio); unicos.variacion = variacionPct(unicos.actual, unicos.previo)
  const tiempo = kpiPromedio(base('tiempo', 'Tiempo en la página', 'Sitio · promedio de durationSec de los eventos engage, medido al salir o ocultar la pestaña.'), [], r.dias, r.diasPrevios, e.tiempo ?? null, e.tiempoPrevio ?? null)
  const iniciadas = kpi(base('demos', 'Demos iniciadas', 'Demo · SiteEvent demo_start, por día de Paraguay.'), iniciosDia, r.dias, r.diasPrevios)
  const visitantesDemo = { actual: N(demoEscalares[0]?.visitantes), previo: N(demoEscalares[0]?.visitantesPrevio) }
  const duracion = kpiPromedio(base('duracionDemo', 'Duración media de la demo', 'Demo · promedio de durationSec de demo_end (tiempo con la pestaña visible).'), duracionDia, r.dias, r.diasPrevios, demoEscalares[0]?.duracion ?? null, demoEscalares[0]?.duracionPrevia ?? null)

  const conteoScroll = new Map(scroll.map(s => [Number(s.clave), N(s.n)]))
  const totalScroll = [...conteoScroll.values()].reduce((a, b) => a + b, 0)
  const conv = conversion[0] ?? { visitantes: 0, convertidos: 0 }

  return {
    periodo,
    rango: { desde: desde.toISOString(), hasta: hasta.toISOString(), zona: ZONA },
    landing: {
      sinDatos: visitas.actual === 0 && visitas.previo === 0,
      kpis: [visitas, unicos, tiempo],
      scroll: {
        promedioPct: e.scroll === null || e.scroll === undefined ? null : Math.round(N(e.scroll)),
        buckets: BUCKETS_SCROLL.filter(b => b > 0).map(b => {
          // «Llegó al 50 %» incluye a quienes llegaron a 75 y 100.
          const n = [...conteoScroll.entries()].filter(([pct]) => pct >= b).reduce((a, [, v]) => a + v, 0)
          return { pct: b, n, porcentaje: porcentaje(n, totalScroll) }
        }),
        fuente: 'Sitio · scrollPct máximo por visita (engage), en escalones de 25 %; cada barra cuenta las visitas que llegaron al menos hasta ese punto.',
      },
      paginas: ranking(paginas), fuentes: ranking(fuentes), dispositivos: ranking(dispositivos),
      notas: {
        paginas: 'Sitio · pageview por ruta (sin query).',
        fuentes: 'Sitio · utm_source si viene en el enlace; si no, el host del referente; sin ninguno, «directo».',
        dispositivos: 'Sitio · tipo de dispositivo según el navegador (no se guarda el agente de usuario).',
      },
    },
    demo: {
      sinDatos: iniciadas.actual === 0 && iniciadas.previo === 0,
      kpis: [iniciadas, duracion],
      visitantes: { ...visitantesDemo, variacion: variacionPct(visitantesDemo.actual, visitantesDemo.previo) },
      roles: ranking(roles), modulos: ranking(modulos),
      conversion: { visitantes: N(conv.visitantes), convertidos: N(conv.convertidos), porcentaje: porcentaje(N(conv.convertidos), N(conv.visitantes)) },
      notas: {
        roles: 'Demo · demo_start por rol elegido (Dueño, Gerente, Vendedor, Caja, Técnico, Delivery).',
        modulos: 'Demo · demo_view por módulo (primer tramo de la ruta dentro de la demo).',
        conversion: 'Demo · visitantes que iniciaron la demo y después hicieron clic en «Crear cuenta / Entrar» (mismo navegador). Es una aproximación: el alta real ocurre en otro dominio.',
      },
    },
  }
}
