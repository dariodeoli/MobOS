import type { Prisma } from '@prisma/client'

// SKU legible y estable: si el código ya existe en la sucursal se agrega un
// sufijo numérico en vez de un timestamp, así el dato se puede dictar y sigue
// siendo el mismo entre corridas.
const SKU_MAX = 60
const SKU_SUFIJO_MAX = 999

export function skuConSufijo(base: string, usados: Set<string>) {
  const raiz = base.slice(0, SKU_MAX) || 'PRODUCTO'
  if (!usados.has(raiz)) return raiz
  for (let numero = 2; numero <= SKU_SUFIJO_MAX; numero += 1) {
    const candidato = `${raiz}-${numero}`
    if (!usados.has(candidato)) return candidato
  }
  throw new Error('No se pudo generar un SKU único para ese nombre.')
}

export async function skuUnico(tx: Prisma.TransactionClient, tenant: string, branchId: string | null, base: string) {
  const raiz = base.slice(0, SKU_MAX) || 'PRODUCTO'
  const filas = await tx.product.findMany({ where: { tenantId: tenant, branchId, sku: { startsWith: raiz } }, select: { sku: true } })
  return skuConSufijo(raiz, new Set(filas.map(fila => fila.sku)))
}
