// Datos de la tienda (#298): una sola fuente de verdad para la tarjeta
// editable de Configuración → Organización.
//
// El formulario se arma con lo guardado y los cambios se calculan campo por
// campo: el mismo resultado alimenta el indicador «hay cambios» (la barra de
// guardado solo aparece con diferencias reales) y el payload del API. El
// teléfono se compara compuesto, como viaja al backend, así reformatearlo no
// cuenta como cambio. Puro y testeable.
import { componerTelefono, parseTelefono } from 'owncoding-ui'

const texto = (valor) => String(valor ?? '').trim()
const soloDigitos = (valor) => String(valor ?? '').replace(/\D/g, '')

/** Valores editables de «Datos de la tienda» a partir de lo guardado. */
export function formularioIdentidad({ empresa, tenant } = {}) {
  const telefono = parseTelefono(tenant?.phone)
  return {
    name: empresa?.nombre || '',
    email: empresa?.email || '',
    address: tenant?.address || '',
    city: tenant?.city || '',
    department: tenant?.department || '',
    countryCode: telefono.countryCode || '+595',
    phone: telefono.phone || '',
    ruc: tenant?.ruc || '',
  }
}

/**
 * Cambios reales entre el borrador y lo guardado. Devuelve `{}` si no hay
 * diferencias; en otro caso, el payload plano de `updateProfile`.
 */
export function cambiosIdentidad(form, { empresa, tenant } = {}) {
  const cambios = {}
  const nombre = texto(form?.name)
  const correo = texto(form?.email)
  if (nombre !== texto(empresa?.nombre)) cambios.name = nombre
  if (correo !== texto(empresa?.email)) cambios.email = correo

  const perfil = {
    address: texto(form?.address),
    city: texto(form?.city),
    department: texto(form?.department),
    phone: componerTelefono({ countryCode: form?.countryCode, phone: form?.phone }) || '',
    ruc: texto(form?.ruc),
  }
  const guardado = {
    address: texto(tenant?.address),
    city: texto(tenant?.city),
    department: texto(tenant?.department),
    phone: texto(tenant?.phone),
    ruc: texto(tenant?.ruc),
  }
  for (const clave of ['address', 'city', 'department', 'ruc']) {
    if (perfil[clave] !== guardado[clave]) cambios[clave] = perfil[clave]
  }
  // El teléfono se compara por dígitos: reformatearlo (espacios, guiones) no
  // es un cambio; modificarlo, sí.
  if (soloDigitos(perfil.phone) !== soloDigitos(guardado.phone)) cambios.phone = perfil.phone
  return cambios
}

/** ¿La tarjeta tiene cambios sin guardar? */
export function hayCambiosIdentidad(form, guardado) {
  return Object.keys(cambiosIdentidad(form, guardado)).length > 0
}
