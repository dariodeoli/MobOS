import type { Prisma } from '@prisma/client'

// Los casos de garantía y de taller guardan el nombre del cliente como texto.
// Esta resolución deja la ficha ligada cuando se puede: por id si vino, o por
// nombre exacto cuando hay una sola coincidencia en la tienda. Nunca inventa ni
// crea fichas: si hay ambigüedad devuelve null y el caso queda con el nombre.
type Cliente = Pick<Prisma.TransactionClient, 'customer'>

export async function resolveCustomerId(tx: Cliente, tenantId: string, rawId: unknown, name: string) {
  const id = typeof rawId === 'string' && rawId.trim() ? rawId.trim().slice(0, 200) : ''
  if (id) {
    const found = await tx.customer.findFirst({ where: { id, tenantId }, select: { id: true } })
    if (found) return found.id
  }
  const nombre = String(name || '').trim()
  if (!nombre) return null
  const matches = await tx.customer.findMany({ where: { tenantId, name: { equals: nombre, mode: 'insensitive' } }, select: { id: true }, take: 2 })
  return matches.length === 1 ? matches[0].id : null
}
