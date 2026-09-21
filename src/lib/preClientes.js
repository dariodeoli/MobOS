// Pre-clientes: borradores de personas consultadas por RUC/CI que todavía no
// tienen ficha. Se guardan al consultar el documento y reaparecen al buscar por
// nombre para no volver a tipearlos; vencen solos (7 días por defecto, ajustable
// por empresa con `settings.preClienteDias`).
//
// Viven en localStorage por empresa: son datos de trabajo del mostrador, no una
// ficha oficial (la ficha la crea la venta).
import { almacenamientoDemo } from './demoStorage.js'
import { normalizarBusqueda } from '../utils/cliente.js'
import { normalizarNombre } from '../utils/nombre.js'

const PREFIJO = 'mobos:preclientes:v1'
const DIAS_DEFAULT = 7
export const MAX_PRECLIENTES = 100

const storage = () => almacenamientoDemo()

const clave = (empresaId) => (empresaId ? `${PREFIJO}:${empresaId}` : null)
const normalizarDocumento = (documento) => String(documento || '').replace(/\s+/g, '').trim().toLowerCase()

export function diasDeBorrador(empresa) {
  const dias = Number(empresa?.settings?.preClienteDias)
  return Number.isFinite(dias) && dias > 0 ? Math.min(365, Math.round(dias)) : DIAS_DEFAULT
}

function leer(empresaId, { ahora = () => Date.now() } = {}) {
  const key = clave(empresaId)
  if (!key) return []
  try {
    const filas = JSON.parse(storage()?.getItem(key) || '[]')
    if (!Array.isArray(filas)) return []
    // Se descartan los vencidos en la lectura (limpieza perezosa).
    return filas.filter((fila) => fila && fila.document && (!fila.venceEn || fila.venceEn > ahora()))
  } catch {
    return []
  }
}

function escribir(empresaId, filas) {
  const key = clave(empresaId)
  if (!key) return false
  try {
    storage()?.setItem(key, JSON.stringify(filas.slice(-MAX_PRECLIENTES)))
    return true
  } catch {
    return false
  }
}

// Guarda (o refresca) el borrador de un documento consultado. Sin nombre no hay
// nada útil que ofrecer después, así que se ignora.
export function guardarPreCliente(empresaId, datos, { dias = DIAS_DEFAULT, ahora = () => Date.now() } = {}) {
  const documento = normalizarDocumento(datos?.document)
  const nombre = normalizarNombre(datos?.name)
  if (!empresaId || !documento || !nombre) return null
  const filas = leer(empresaId, { ahora }).filter((fila) => normalizarDocumento(fila.document) !== documento)
  const borrador = {
    document: String(datos.document).trim(),
    name: nombre,
    ...(datos.phone ? { phone: String(datos.phone).trim() } : {}),
    ...(datos.countryCode ? { countryCode: String(datos.countryCode).trim() } : {}),
    ...(datos.email ? { email: String(datos.email).trim() } : {}),
    ...(datos.billingName ? { billingName: String(datos.billingName).trim() } : {}),
    ...(datos.billingDocument ? { billingDocument: String(datos.billingDocument).trim() } : {}),
    creadoEn: ahora(),
    venceEn: ahora() + dias * 86400000,
  }
  escribir(empresaId, [...filas, borrador])
  return borrador
}

export function listarPreClientes(empresaId, { ahora = () => Date.now() } = {}) {
  return leer(empresaId, { ahora }).sort((a, b) => Number(b.creadoEn || 0) - Number(a.creadoEn || 0))
}

// Borradores que coinciden con la consulta por nombre o documento (sin acentos
// ni mayúsculas, igual que la búsqueda de clientes).
export function buscarPreClientes(empresaId, consulta, { ahora = () => Date.now() } = {}) {
  const texto = normalizarBusqueda(consulta)
  if (!texto) return []
  const digitos = String(consulta || '').replace(/\D/g, '')
  return listarPreClientes(empresaId, { ahora }).filter((fila) => {
    if (normalizarBusqueda(fila.name).includes(texto)) return true
    if (digitos.length >= 4 && normalizarDocumento(fila.document).includes(digitos)) return true
    return false
  })
}

export function descartarPreCliente(empresaId, documento, { ahora = () => Date.now() } = {}) {
  const objetivo = normalizarDocumento(documento)
  if (!empresaId || !objetivo) return false
  const filas = leer(empresaId, { ahora }).filter((fila) => normalizarDocumento(fila.document) !== objetivo)
  return escribir(empresaId, filas)
}
