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
  const direcciones = (Array.isArray(customer.addresses) ? customer.addresses : [])
    .flatMap(address => [address.label, address.address, address.city, address.department, address.country])
  return normalizarBusqueda(
    [
      customer.name, ...phones, customer.document, customer.email,
      customer.billingName, customer.billingDocument, customer.notes,
      ...(Array.isArray(customer.tags) ? customer.tags : []), ...direcciones,
    ].filter(Boolean).join(' '),
  )
}

export function coincideCliente(customer, query) {
  const texto = normalizarBusqueda(query)
  if (!texto) return true
  const palabras = texto.split(/\s+/).filter(Boolean)
  const buscable = textoBusquedaCliente(customer)
  return palabras.every(palabra => buscable.includes(palabra))
}

// Nombre visible en listados: primer nombre + primer apellido, para que el
// apellido no desaparezca cuando el cliente tiene nombre compuesto o RUC con
// dos apellidos. El nombre completo queda en la ficha y en el detalle.
// - 1 a 3 tokens: tal cual ("Juan", "Juan Pérez", "Cliente E2E 4f2"); con tres
//   tokens no se puede saber si el del medio es un segundo nombre o un primer
//   apellido, así que se respeta el orden.
// - 4 o más: primer apellido, el anterior al último ("Dario José Oliveira
//   Benítez" → "Dario Oliveira").
export function nombreCortoCliente(name) {
  const partes = String(name ?? '').trim().split(/\s+/).filter(Boolean)
  if (partes.length <= 3) return partes.join(' ')
  return `${partes[0]} ${partes[partes.length - 2]}`
}

export function datosFacturacionCliente(customer = {}) {
  if (!customer.billingName && !customer.billingDocument) return null
  return { name: customer.billingName || '', document: customer.billingDocument || '' }
}
