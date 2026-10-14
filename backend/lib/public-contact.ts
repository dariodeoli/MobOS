import { digitsOnly, internationalPhone } from './validation'

// Contacto público de la SUCURSAL (#412): el único teléfono que viaja en las
// páginas públicas para «Escribir por WhatsApp». Sale siempre de la sucursal;
// nunca del cliente ni de un empleado. Sin teléfono utilizable devuelve null y
// la página no muestra el botón.
export type ContactoPublico = { sucursal: string | null; telefono: string; whatsapp: string; whatsappUrl: string }

export function contactoPublicoSucursal(branch: { name?: string | null; phone?: string | null } | null | undefined): ContactoPublico | null {
  const crudo = String(branch?.phone ?? '').trim()
  if (digitsOnly(crudo).length < 6) return null
  const whatsapp = internationalPhone(crudo)
  return { sucursal: branch?.name || null, telefono: crudo, whatsapp, whatsappUrl: `https://wa.me/${whatsapp}` }
}

// Contacto del portal del cliente: la sucursal de su pedido más reciente o, si
// no tiene, la primera sucursal activa con teléfono del negocio.
export async function contactoPublicoDePortal(prisma: any, tenantId: string, customerId: string): Promise<ContactoPublico | null> {
  const pedido = await prisma.order.findFirst({
    where: { tenantId, customerId, archivedAt: null, branch: { phone: { not: null } } },
    orderBy: { createdAt: 'desc' },
    select: { branch: { select: { name: true, phone: true } } },
  })
  const sucursal = pedido?.branch || await prisma.branch.findFirst({
    where: { tenantId, isActive: true, phone: { not: null } },
    orderBy: { createdAt: 'asc' },
    select: { name: true, phone: true },
  })
  return contactoPublicoSucursal(sucursal)
}
