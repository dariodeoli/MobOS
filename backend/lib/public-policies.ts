import { prisma } from './prisma'
import { POLICY_LABELS, POLICY_TYPES, policiesFrom, type PolicyType } from './policies'

// Vista pública de las políticas de una empresa (#433). Se resuelve por el slug
// de la empresa y solo entrega lo PUBLICADO más datos de contacto del negocio:
// nada interno (ni borradores, ni costos, ni ajustes).
export const SLUG_VALIDO = /^[a-z0-9][a-z0-9-]{0,80}$/

export async function empresaPublicaPorSlug(slug: string) {
  if (!SLUG_VALIDO.test(slug)) return null
  const tenant = await prisma.tenant.findFirst({
    where: { slug, archivedAt: null },
    select: { id: true, name: true, slug: true, phone: true, email: true, address: true, city: true, department: true, settings: true, logos: { select: { variant: true } } },
  })
  if (!tenant) return null
  const policies = policiesFrom(tenant.settings)
  const publicadas = POLICY_TYPES.filter(type => policies[type].published)
  return {
    id: tenant.id,
    policies,
    publicadas,
    company: {
      name: tenant.name,
      slug: tenant.slug,
      phone: tenant.phone || null,
      email: tenant.email || null,
      address: tenant.address || null,
      city: tenant.city || null,
      department: tenant.department || null,
      logo: tenant.logos.length > 0,
    },
  }
}

export function politicaPublica(policies: ReturnType<typeof policiesFrom>, type: PolicyType) {
  return { type, label: POLICY_LABELS[type], content: policies[type].content, updatedAt: policies[type].updatedAt }
}

/**
 * Datos mínimos para enlazar «Políticas de la tienda» desde las páginas
 * públicas del pedido, la cotización y el portal: el slug solo viaja si hay al
 * menos una política publicada (si no, la página no muestra el enlace).
 */
export function politicasPublicadas(tenant: { slug?: string | null; settings?: unknown } | null | undefined) {
  if (!tenant?.slug) return { policiesSlug: null }
  const policies = policiesFrom(tenant.settings)
  return { policiesSlug: POLICY_TYPES.some(type => policies[type].published) ? tenant.slug : null }
}
