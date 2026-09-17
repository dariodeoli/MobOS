// Búsqueda de clientes: nombre, apellido, nombre completo, teléfonos, CI/RUC,
// correo y datos de facturación (razón social y RUC del titular). Sin acentos
// ni mayúsculas para que "perez" encuentre a "Pérez".
export function normalizarBusqueda(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

export function textoBusquedaCliente(customer = {}) {
  const phones = [customer.phone, ...(Array.isArray(customer.phones) ? customer.phones : [])]
  return normalizarBusqueda(
    [customer.name, ...phones, customer.document, customer.email, customer.billingName, customer.billingDocument]
      .filter(Boolean)
      .join(' '),
  )
}

export function coincideCliente(customer, query) {
  const texto = normalizarBusqueda(query)
  if (!texto) return true
  const palabras = texto.split(/\s+/).filter(Boolean)
  const buscable = textoBusquedaCliente(customer)
  return palabras.every(palabra => buscable.includes(palabra))
}

export function datosFacturacionCliente(customer = {}) {
  if (!customer.billingName && !customer.billingDocument) return null
  return { name: customer.billingName || '', document: customer.billingDocument || '' }
}
