import { Prisma } from '@prisma/client'

// Único punto donde se decide qué empresa es de demostración. TODA consulta del
// panel de plataforma excluye esas empresas con este helper (hay un test que lo
// verifica) y las demos se muestran aparte con `filtroSoloDemo`.
export const SLUG_DEMO = 'mobos-demo'

function columna(alias: string, nombre: string): Prisma.Sql {
  return Prisma.raw(`"${alias.replace(/[^a-zA-Z0-9_]/g, '')}"."${nombre}"`)
}

/** Fragmento SQL: la empresa `alias` NO es de demostración. */
export function filtroSinDemo(alias = 't'): Prisma.Sql {
  return Prisma.sql`(${columna(alias, 'slug')} <> ${SLUG_DEMO} AND COALESCE(${columna(alias, 'settings')}->>'demo', 'false') <> 'true')`
}

/** Fragmento SQL: la empresa `alias` ES de demostración (solo para el contador aparte). */
export function filtroSoloDemo(alias = 't'): Prisma.Sql {
  return Prisma.sql`(${columna(alias, 'slug')} = ${SLUG_DEMO} OR COALESCE(${columna(alias, 'settings')}->>'demo', 'false') = 'true')`
}
