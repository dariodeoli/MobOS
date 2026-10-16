// Identidad de la empresa en el papel (#426): una sola fuente para el
// encabezado y el pie de TODO impreso (HTML y ESC/POS). La sesión fija el
// tenant (razón social, RUC, dirección, contacto) y la sucursal activa; cada
// builder puede pasar los suyos y estos mandan. Sin datos cae a la marca de la
// app: el papel nunca sale sin encabezado ni se rompe en tests.
const texto = (valor) => String(valor ?? '').trim()

let actual = { tenant: null, branch: null }

// Logo en bits para la térmica, uno por ancho de rollo (80 y 58 mm): lo carga la
// sesión una sola vez y lo usa el encabezado de TODOS los tickets (#426).
let logos = { 80: null, 58: null }
export function fijarLogoImpresion({ 80: ochenta = null, 58: cincuentaYOcho = null } = {}) {
  logos = { 80: ochenta, 58: cincuentaYOcho }
}
export const logoImpresion = (columnas = 48) => (Number(columnas) >= 48 ? logos[80] : logos[58])

// Normaliza las dos formas de los datos (API: name/address/phone; sesión y demo:
// nombre/direccion/telefono).
export function normalizarTenant(tenant = null) {
  if (!tenant || typeof tenant !== 'object') return null
  const name = texto(tenant.name || tenant.nombre || tenant.razonSocial)
  if (!name) return null
  return {
    name,
    ruc: texto(tenant.ruc),
    brandColor: texto(tenant.brandColor || tenant.primaryColor || tenant.colorMarca),
    address: texto(tenant.address || tenant.direccion),
    city: texto(tenant.city || tenant.ciudad),
    department: texto(tenant.department),
    phone: texto(tenant.phone || tenant.telefono),
    email: texto(tenant.email),
  }
}

export function normalizarSucursal(branch = null) {
  if (!branch || typeof branch !== 'object') return null
  const name = texto(branch.name || branch.nombre)
  if (!name) return null
  return {
    name,
    address: texto(branch.address || branch.direccion),
    city: texto(branch.city || branch.ciudad),
    phone: texto(branch.phone || branch.telefono),
  }
}

/** La sesión informa la empresa y/o la sucursal activas (parcial o completo). */
export function fijarEmpresaImpresion({ tenant, branch } = {}) {
  if (tenant !== undefined) actual = { ...actual, tenant: normalizarTenant(tenant) }
  if (branch !== undefined) actual = { ...actual, branch: normalizarSucursal(branch) }
}

export const empresaImpresion = () => actual

/**
 * Datos del encabezado: `fuente` ({ tenant, branch }) manda sobre la sesión.
 * Devuelve la razón social, las líneas (RUC, dirección, sucursal, contacto) y
 * los objetos normalizados.
 */
export function datosEncabezado(fuente = {}) {
  const tenant = normalizarTenant(fuente.tenant) || actual.tenant
  const branch = normalizarSucursal(fuente.branch) || actual.branch
  const direccion = [tenant?.address, tenant?.city, tenant?.department].filter(Boolean).join(', ')
  const sucursal = [branch?.name, branch?.address, branch?.city].filter(Boolean).join(' · ')
  const contacto = [branch?.phone || tenant?.phone, tenant?.email].filter(Boolean).join(' · ')
  return {
    tenant,
    branch,
    razon: tenant?.name || '',
    lineas: [tenant?.ruc ? `RUC ${tenant.ruc}` : '', direccion, sucursal, contacto].filter(Boolean),
  }
}
