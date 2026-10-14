import { Prisma } from '@prisma/client'
import { prisma } from '../prisma'
import { filtroSinDemo, filtroSoloDemo } from './filtro-demo'
import { ZONA, rangoDePeriodo, rellenarSerie, sumaSerie, variacionPct, type Periodo, type PuntoSerie } from './rangos'

// Consultas del panel de plataforma. Reglas:
// - Solo agregados SQL parametrizados ($queryRaw): nunca se traen todas las filas.
// - Cada consulta une la empresa (alias "t") y aplica `filtroSinDemo('t')`.
// - Los días se agrupan en la zona horaria de Paraguay.
export const PAGINA = 30

type FilaDia = { dia: string; valor: bigint | number }
const num = (valor: unknown) => Number(valor ?? 0)
const diaSql = (columna: string) => Prisma.sql`to_char((${Prisma.raw(columna)} AT TIME ZONE 'UTC') AT TIME ZONE ${ZONA}, 'YYYY-MM-DD')`

export type Kpi = {
  clave: string
  etiqueta: string
  actual: number
  previo: number
  variacion: number | null
  serie: PuntoSerie[]
  seriePrevia: PuntoSerie[]
  unidad: 'cantidad' | 'pyg'
  fuente: string
}

function kpi(base: { clave: string; etiqueta: string; unidad: 'cantidad' | 'pyg'; fuente: string }, filas: FilaDia[], dias: string[], diasPrevios: string[]): Kpi {
  const todas = filas.map(f => ({ dia: String(f.dia), valor: num(f.valor) }))
  const actualSerie = rellenarSerie(todas, dias)
  const previaSerie = rellenarSerie(todas, diasPrevios)
  const actual = sumaSerie(actualSerie)
  const previo = sumaSerie(previaSerie)
  return { ...base, actual, previo, variacion: variacionPct(actual, previo), serie: actualSerie, seriePrevia: previaSerie }
}

export async function resumenPlataforma(periodo: Periodo, ahora = new Date()) {
  const r = rangoDePeriodo(periodo, ahora)
  const desdeTodo = r.previoDesde
  const hasta = r.hasta

  const [altasEmpresas, pedidos, ventas, usuariosNuevos, activosPorDia, activosActual, activosPrevio, totales, demo] = await Promise.all([
    prisma.$queryRaw<FilaDia[]>(Prisma.sql`
      SELECT ${diaSql('t."createdAt"')} AS dia, COUNT(*)::int AS valor
      FROM "Tenant" t
      WHERE t."createdAt" >= ${desdeTodo} AND t."createdAt" < ${hasta} AND ${filtroSinDemo('t')}
      GROUP BY 1`),
    prisma.$queryRaw<FilaDia[]>(Prisma.sql`
      SELECT ${diaSql('o."createdAt"')} AS dia, COUNT(*)::int AS valor
      FROM "Order" o JOIN "Tenant" t ON t."id" = o."tenantId"
      WHERE o."createdAt" >= ${desdeTodo} AND o."createdAt" < ${hasta} AND o."status" <> 'CANCELLED' AND ${filtroSinDemo('t')}
      GROUP BY 1`),
    prisma.$queryRaw<FilaDia[]>(Prisma.sql`
      SELECT ${diaSql('o."createdAt"')} AS dia, COALESCE(SUM(o."totalPyg"), 0)::bigint AS valor
      FROM "Order" o JOIN "Tenant" t ON t."id" = o."tenantId"
      WHERE o."createdAt" >= ${desdeTodo} AND o."createdAt" < ${hasta} AND o."status" <> 'CANCELLED' AND ${filtroSinDemo('t')}
      GROUP BY 1`),
    prisma.$queryRaw<FilaDia[]>(Prisma.sql`
      SELECT ${diaSql('u."createdAt"')} AS dia, COUNT(*)::int AS valor
      FROM "User" u JOIN "Tenant" t ON t."id" = u."tenantId"
      WHERE u."createdAt" >= ${desdeTodo} AND u."createdAt" < ${hasta} AND ${filtroSinDemo('t')}
      GROUP BY 1`),
    // Usuarios distintos con actividad por día (para la curva).
    prisma.$queryRaw<FilaDia[]>(Prisma.sql`
      SELECT ${diaSql('s."lastSeenAt"')} AS dia, COUNT(DISTINCT s."userId")::int AS valor
      FROM "UsageSession" s JOIN "Tenant" t ON t."id" = s."tenantId"
      WHERE s."lastSeenAt" >= ${desdeTodo} AND s."lastSeenAt" < ${hasta} AND ${filtroSinDemo('t')}
      GROUP BY 1`),
    // Usuarios distintos en TODO el período (no es la suma de los días).
    prisma.$queryRaw<{ n: number }[]>(Prisma.sql`
      SELECT COUNT(DISTINCT s."userId")::int AS n
      FROM "UsageSession" s JOIN "Tenant" t ON t."id" = s."tenantId"
      WHERE s."lastSeenAt" >= ${r.desde} AND s."lastSeenAt" < ${hasta} AND ${filtroSinDemo('t')}`),
    prisma.$queryRaw<{ n: number }[]>(Prisma.sql`
      SELECT COUNT(DISTINCT s."userId")::int AS n
      FROM "UsageSession" s JOIN "Tenant" t ON t."id" = s."tenantId"
      WHERE s."lastSeenAt" >= ${r.previoDesde} AND s."lastSeenAt" < ${r.previoHasta} AND ${filtroSinDemo('t')}`),
    prisma.$queryRaw<{ empresas: number; activas: number; empresasPrevio: number; usuarios: number; usuariosActivos: number }[]>(Prisma.sql`
      SELECT
        COUNT(*)::int AS empresas,
        COUNT(*) FILTER (WHERE t."archivedAt" IS NULL)::int AS activas,
        COUNT(*) FILTER (WHERE t."createdAt" < ${r.previoHasta})::int AS "empresasPrevio",
        (SELECT COUNT(*)::int FROM "User" u JOIN "Tenant" t2 ON t2."id" = u."tenantId" WHERE ${filtroSinDemo('t2')}) AS usuarios,
        (SELECT COUNT(*)::int FROM "User" u JOIN "Tenant" t3 ON t3."id" = u."tenantId" WHERE u."status" = 'ACTIVE' AND ${filtroSinDemo('t3')}) AS "usuariosActivos"
      FROM "Tenant" t
      WHERE t."createdAt" < ${hasta} AND ${filtroSinDemo('t')}`),
    prisma.$queryRaw<{ empresas: number; usuarios: number; pedidos: number }[]>(Prisma.sql`
      SELECT
        COUNT(*)::int AS empresas,
        (SELECT COUNT(*)::int FROM "User" u JOIN "Tenant" td ON td."id" = u."tenantId" WHERE ${filtroSoloDemo('td')}) AS usuarios,
        (SELECT COUNT(*)::int FROM "Order" o JOIN "Tenant" te ON te."id" = o."tenantId" WHERE ${filtroSoloDemo('te')}) AS pedidos
      FROM "Tenant" t WHERE ${filtroSoloDemo('t')}`),
  ])

  const base = (clave: string, etiqueta: string, unidad: 'cantidad' | 'pyg', fuente: string) => ({ clave, etiqueta, unidad, fuente })
  const altas = kpi(base('altas', 'Nuevas altas', 'cantidad', 'Empresas · Tenant.createdAt, por día de Paraguay. Excluye demos.'), altasEmpresas, r.dias, r.diasPrevios)
  const pedidosKpi = kpi(base('pedidos', 'Pedidos', 'cantidad', 'Ventas · Order.createdAt, sin cancelados, por día de Paraguay. Excluye demos.'), pedidos, r.dias, r.diasPrevios)
  const ventasKpi = kpi(base('ventas', 'Ventas (Gs.)', 'pyg', 'Ventas · suma de Order.totalPyg sin cancelados, por día de Paraguay. Excluye demos.'), ventas, r.dias, r.diasPrevios)
  const nuevosUsuarios = kpi(base('usuariosNuevos', 'Usuarios nuevos', 'cantidad', 'Equipo · User.createdAt, por día de Paraguay. Excluye demos.'), usuariosNuevos, r.dias, r.diasPrevios)
  const activos = kpi(base('usuariosActivos', 'Usuarios activos', 'cantidad', 'Presencia · usuarios distintos con latido (UsageSession.lastSeenAt) en el período; la curva cuenta distintos por día. Excluye demos.'), activosPorDia, r.dias, r.diasPrevios)
  // El total del período son usuarios DISTINTOS, no la suma de los días.
  activos.actual = num(activosActual[0]?.n)
  activos.previo = num(activosPrevio[0]?.n)
  activos.variacion = variacionPct(activos.actual, activos.previo)

  const total = totales[0] ?? { empresas: 0, activas: 0, empresasPrevio: 0, usuarios: 0, usuariosActivos: 0 }
  const empresas: Kpi = {
    clave: 'empresas', etiqueta: 'Empresas', unidad: 'cantidad',
    actual: num(total.empresas), previo: num(total.empresasPrevio), variacion: variacionPct(num(total.empresas), num(total.empresasPrevio)),
    serie: altas.serie, seriePrevia: altas.seriePrevia,
    fuente: 'Empresas · Tenant creadas hasta el cierre del período (la curva muestra las altas por día). Excluye demos.',
  }

  const d = demo[0] ?? { empresas: 0, usuarios: 0, pedidos: 0 }
  return {
    periodo,
    rango: { desde: r.desde.toISOString(), hasta: r.hasta.toISOString(), previoDesde: r.previoDesde.toISOString(), previoHasta: r.previoHasta.toISOString(), zona: ZONA },
    kpis: [empresas, activos, pedidosKpi, ventasKpi, altas, nuevosUsuarios],
    totales: { empresasActivas: num(total.activas), usuarios: num(total.usuarios), usuariosHabilitados: num(total.usuariosActivos) },
    demo: { empresas: num(d.empresas), usuarios: num(d.usuarios), pedidos: num(d.pedidos) },
    sinDatos: num(total.empresas) === 0,
  }
}

// ── Empresas ──────────────────────────────────────────────────────────────
const ORDEN_EMPRESAS: Record<string, string> = {
  alta: 't."createdAt"', nombre: 'lower(t."name")', usuarios: 'COALESCE(u.n, 0)', pedidos: 'COALESCE(o.n, 0)', actividad: 'a.ultima',
}
const ORDEN_USUARIOS: Record<string, string> = {
  alta: 'u."createdAt"', nombre: 'lower(u."name")', acceso: 'u."lastAccessAt"', empresa: 'lower(t."name")',
}

export type ParamsLista = { q: string; estado: string; extra: string; orden: string; dir: 'asc' | 'desc'; pagina: number }

export function leerParamsLista(url: URL, ordenes: readonly string[], ordenDefecto: string): ParamsLista {
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 80)
  const orden = ordenes.includes(url.searchParams.get('orden') ?? '') ? (url.searchParams.get('orden') as string) : ordenDefecto
  const dir = url.searchParams.get('dir') === 'asc' ? 'asc' : 'desc'
  const pagina = Math.min(10_000, Math.max(1, Math.floor(Number(url.searchParams.get('pagina')) || 1)))
  return { q, estado: (url.searchParams.get('estado') ?? '').slice(0, 20), extra: (url.searchParams.get('rol') ?? '').slice(0, 20), orden, dir, pagina }
}

export const ORDENES_EMPRESAS = Object.keys(ORDEN_EMPRESAS)
export const ORDENES_USUARIOS = Object.keys(ORDEN_USUARIOS)

/** Texto de búsqueda seguro para ILIKE: escapa % _ \ para que no actúen como comodines. */
export function patronBusqueda(q: string): string {
  return `%${q.replace(/[\\%_]/g, c => `\\${c}`)}%`
}

export async function listarEmpresas(p: ParamsLista, ahora = new Date()) {
  const hace30 = new Date(ahora.getTime() - 30 * 86_400_000)
  const condiciones: Prisma.Sql[] = [Prisma.sql`TRUE`]
  if (p.q) {
    const patron = patronBusqueda(p.q)
    condiciones.push(Prisma.sql`(t."name" ILIKE ${patron} OR t."email" ILIKE ${patron} OR t."slug" ILIKE ${patron} OR t."ruc" ILIKE ${patron})`)
  }
  if (p.estado === 'activas') condiciones.push(Prisma.sql`t."archivedAt" IS NULL`)
  else if (p.estado === 'archivadas') condiciones.push(Prisma.sql`t."archivedAt" IS NOT NULL`)
  else if (p.estado === 'inactivas') condiciones.push(Prisma.sql`t."archivedAt" IS NULL AND (a.ultima IS NULL OR a.ultima < ${hace30})`)
  const donde = Prisma.join(condiciones, ' AND ')
  const orden = Prisma.raw(`${ORDEN_EMPRESAS[p.orden]} ${p.dir === 'asc' ? 'ASC' : 'DESC'} NULLS LAST, t."id"`)
  const union = Prisma.sql`
    FROM "Tenant" t
    LEFT JOIN (SELECT "tenantId", COUNT(*)::int AS n FROM "User" GROUP BY 1) u ON u."tenantId" = t."id"
    LEFT JOIN (SELECT "tenantId", COUNT(*)::int AS n FROM "Order" WHERE "status" <> 'CANCELLED' GROUP BY 1) o ON o."tenantId" = t."id"
    LEFT JOIN (SELECT "tenantId", MAX("lastSeenAt") AS ultima FROM "UsageSession" GROUP BY 1) a ON a."tenantId" = t."id"`
  const [filas, total] = await Promise.all([
    prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT t."id", t."name", t."slug", t."email", t."createdAt", t."archivedAt", t."ruc",
             COALESCE(u.n, 0)::int AS usuarios, COALESCE(o.n, 0)::int AS pedidos, a.ultima AS "ultimaActividad"
      ${union}
      WHERE ${filtroSinDemo('t')} AND ${donde}
      ORDER BY ${orden}
      LIMIT ${PAGINA} OFFSET ${(p.pagina - 1) * PAGINA}`),
    prisma.$queryRaw<{ n: number }[]>(Prisma.sql`SELECT COUNT(*)::int AS n ${union} WHERE ${filtroSinDemo('t')} AND ${donde}`),
  ])
  return { items: filas, total: num(total[0]?.n), pagina: p.pagina, porPagina: PAGINA }
}

export async function detalleEmpresa(id: string, ahora = new Date()) {
  const hace30 = new Date(ahora.getTime() - 30 * 86_400_000)
  const [empresa, equipo] = await Promise.all([
    prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT t."id", t."name", t."slug", t."email", t."emailVerifiedAt", t."ruc", t."city", t."department", t."phone", t."createdAt", t."archivedAt",
        (SELECT COUNT(*)::int FROM "User" u WHERE u."tenantId" = t."id") AS usuarios,
        (SELECT COUNT(*)::int FROM "User" u WHERE u."tenantId" = t."id" AND u."status" = 'ACTIVE') AS "usuariosActivos",
        (SELECT COUNT(*)::int FROM "Branch" b WHERE b."tenantId" = t."id") AS sucursales,
        (SELECT COUNT(*)::int FROM "Order" o WHERE o."tenantId" = t."id" AND o."status" <> 'CANCELLED') AS pedidos,
        (SELECT COUNT(*)::int FROM "Order" o WHERE o."tenantId" = t."id" AND o."status" <> 'CANCELLED' AND o."createdAt" >= ${hace30}) AS "pedidos30",
        (SELECT COALESCE(SUM(o."totalPyg"), 0)::bigint FROM "Order" o WHERE o."tenantId" = t."id" AND o."status" <> 'CANCELLED' AND o."createdAt" >= ${hace30}) AS "ventas30",
        (SELECT MAX(s."lastSeenAt") FROM "UsageSession" s WHERE s."tenantId" = t."id") AS "ultimaActividad"
      FROM "Tenant" t
      WHERE t."id" = ${id} AND ${filtroSinDemo('t')}`),
    prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT u."id", u."name", u."email", u."role", u."status", u."lastAccessAt"
      FROM "User" u JOIN "Tenant" t ON t."id" = u."tenantId"
      WHERE u."tenantId" = ${id} AND ${filtroSinDemo('t')}
      ORDER BY u."createdAt" ASC LIMIT 50`),
  ])
  if (!empresa[0]) return null
  return { ...empresa[0], equipo }
}

// ── Usuarios ──────────────────────────────────────────────────────────────
const ESTADOS_USUARIO = ['ACTIVE', 'INACTIVE', 'SUSPENDED']
const ROLES_USUARIO = ['ADMIN', 'GERENTE', 'VENDEDOR', 'CAJERA', 'TECNICO', 'REPARTIDOR']

export async function listarUsuarios(p: ParamsLista) {
  const condiciones: Prisma.Sql[] = [Prisma.sql`TRUE`]
  if (p.q) {
    const patron = patronBusqueda(p.q)
    condiciones.push(Prisma.sql`(u."name" ILIKE ${patron} OR u."email" ILIKE ${patron} OR t."name" ILIKE ${patron})`)
  }
  if (ESTADOS_USUARIO.includes(p.estado)) condiciones.push(Prisma.sql`u."status" = ${p.estado}::"UserStatus"`)
  if (ROLES_USUARIO.includes(p.extra)) condiciones.push(Prisma.sql`u."role" = ${p.extra}::"UserRole"`)
  const donde = Prisma.join(condiciones, ' AND ')
  const orden = Prisma.raw(`${ORDEN_USUARIOS[p.orden]} ${p.dir === 'asc' ? 'ASC' : 'DESC'} NULLS LAST, u."id"`)
  const union = Prisma.sql`FROM "User" u JOIN "Tenant" t ON t."id" = u."tenantId"`
  const [filas, total] = await Promise.all([
    prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT u."id", u."name", u."email", u."role", u."status", u."createdAt", u."lastAccessAt",
             t."id" AS "empresaId", t."name" AS empresa
      ${union}
      WHERE ${filtroSinDemo('t')} AND ${donde}
      ORDER BY ${orden}
      LIMIT ${PAGINA} OFFSET ${(p.pagina - 1) * PAGINA}`),
    prisma.$queryRaw<{ n: number }[]>(Prisma.sql`SELECT COUNT(*)::int AS n ${union} WHERE ${filtroSinDemo('t')} AND ${donde}`),
  ])
  return { items: filas, total: num(total[0]?.n), pagina: p.pagina, porPagina: PAGINA }
}

export async function detalleUsuario(id: string) {
  const filas = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT u."id", u."name", u."email", u."role", u."status", u."createdAt", u."lastAccessAt",
           t."id" AS "empresaId", t."name" AS empresa,
           (SELECT COUNT(*)::int FROM "Order" o WHERE o."sellerId" = u."id" AND o."status" <> 'CANCELLED') AS pedidos,
           (SELECT MAX(s."lastSeenAt") FROM "UsageSession" s WHERE s."userId" = u."id") AS "ultimaActividad",
           (SELECT COALESCE(SUM(s."activeSeconds"), 0)::int FROM "UsageSession" s WHERE s."userId" = u."id") AS "segundosActivos",
           (SELECT COUNT(*)::int FROM "Session" ss WHERE ss."userId" = u."id" AND ss."revokedAt" IS NULL AND ss."expiresAt" > now()) AS "sesionesAbiertas"
    FROM "User" u JOIN "Tenant" t ON t."id" = u."tenantId"
    WHERE u."id" = ${id} AND ${filtroSinDemo('t')}`)
  return filas[0] ?? null
}
