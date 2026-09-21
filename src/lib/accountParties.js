import { api } from './api/client'
import { isDemoRuntime } from './demoMode'
import { nombreCompleto, textoBuscable } from './accountNames'

export { nombreCompleto, textoBuscable }

// Empresas privadas y titulares de cuentas de cobro (#143). Los datos son
// privados: se gestionan en Configuración → Negocio y solo los ve el dueño.

const HOLDERS_ENDPOINT = '/api/account-holders'
const COMPANIES_ENDPOINT = '/api/private-companies'
const HOLDERS_DEMO_KEY = 'mobos:demo-account-holders:v1'
const COMPANIES_DEMO_KEY = 'mobos:demo-private-companies:v1'

const HOLDER_DEFAULTS = { firstName: '', middleName: '', otherName: '', lastName: '', secondLastName: '', document: '', isActive: true }
const COMPANY_DEFAULTS = { legalName: '', ruc: '', legalAddress: '', notes: '', isActive: true }

const TEXTO = (valor, max, mensaje) => {
  const texto = String(valor ?? '').trim()
  if (texto.length > max) throw new Error(mensaje)
  return texto
}

function validarTitular(data, partial = false) {
  const result = partial ? {} : { ...HOLDER_DEFAULTS }
  for (const key of Object.keys(HOLDER_DEFAULTS)) {
    if (!Object.hasOwn(data, key)) continue
    if (key === 'isActive') {
      if (typeof data.isActive !== 'boolean') throw new Error('Estado del titular inválido.')
      result.isActive = data.isActive
      continue
    }
    result[key] = TEXTO(data[key], 80, 'Cada campo admite hasta 80 caracteres.')
  }
  if (!partial && !result.firstName) throw new Error('Ingresá el primer nombre del titular.')
  if (!partial && !result.lastName) throw new Error('Ingresá el primer apellido del titular.')
  if (partial && !Object.keys(result).length) throw new Error('No hay cambios para guardar.')
  return result
}

function validarEmpresa(data, partial = false) {
  const result = partial ? {} : { ...COMPANY_DEFAULTS }
  for (const key of Object.keys(COMPANY_DEFAULTS)) {
    if (!Object.hasOwn(data, key)) continue
    if (key === 'isActive') {
      if (typeof data.isActive !== 'boolean') throw new Error('Estado de la empresa inválido.')
      result.isActive = data.isActive
      continue
    }
    const max = key === 'legalAddress' ? 400 : key === 'notes' ? 1000 : 200
    result[key] = TEXTO(data[key], max, `El campo admite hasta ${max} caracteres.`)
  }
  if (!partial && !result.legalName) throw new Error('Ingresá el nombre legal de la empresa.')
  if (partial && !Object.keys(result).length) throw new Error('No hay cambios para guardar.')
  return result
}

function demoStore(clave) {
  return {
    read() {
      try {
        const raw = localStorage.getItem(clave)
        if (raw === null) return []
        const rows = JSON.parse(raw)
        if (!Array.isArray(rows)) throw new Error()
        return rows
      } catch { throw new Error('Los datos privados guardados no son válidos. No se sobrescribieron.') }
    },
    write(rows) {
      try { localStorage.setItem(clave, JSON.stringify(rows)) }
      catch { throw new Error('No se pudieron guardar los datos privados en este navegador.') }
      return rows
    },
  }
}

const demoHolders = demoStore(HOLDERS_DEMO_KEY)
const demoCompanies = demoStore(COMPANIES_DEMO_KEY)

const listaDe = (payload) => {
  const rows = payload?.data ?? payload
  if (!Array.isArray(rows)) throw new Error('La API no devolvió una lista válida.')
  return rows
}

const entidadDe = (payload) => {
  const row = payload?.data ?? payload
  if (!row || typeof row !== 'object' || Array.isArray(row) || !row.id) throw new Error('La API no devolvió el registro guardado.')
  return row
}

// ── Titulares ─────────────────────────────────────────────────────────
export async function getAccountHolders() {
  if (isDemoRuntime) return demoHolders.read()
  return listaDe(await api.get(HOLDERS_ENDPOINT))
}

export async function createAccountHolder(data) {
  const values = validarTitular(data)
  if (!isDemoRuntime) return entidadDe(await api.post(HOLDERS_ENDPOINT, values))
  const row = { ...values, id: `demo-${globalThis.crypto.randomUUID()}` }
  demoHolders.write([...demoHolders.read(), row])
  return row
}

export async function updateAccountHolder(id, data) {
  if (typeof id !== 'string' || !id.trim()) throw new Error('Identificador de titular inválido.')
  const values = validarTitular(data, true)
  if (!isDemoRuntime) return entidadDe(await api.patch(HOLDERS_ENDPOINT, { ...values, id }))
  const rows = demoHolders.read()
  if (!rows.some((row) => row.id === id)) throw new Error('El titular ya no está disponible.')
  const updated = { ...rows.find((row) => row.id === id), ...values, id }
  demoHolders.write(rows.map((row) => (row.id === id ? updated : row)))
  return updated
}

// ── Empresas/personas jurídicas privadas ──────────────────────────────
export async function getPrivateCompanies() {
  if (isDemoRuntime) return demoCompanies.read()
  return listaDe(await api.get(COMPANIES_ENDPOINT))
}

export async function createPrivateCompany(data) {
  const values = validarEmpresa(data)
  if (!isDemoRuntime) return entidadDe(await api.post(COMPANIES_ENDPOINT, values))
  const row = { ...values, id: `demo-${globalThis.crypto.randomUUID()}` }
  demoCompanies.write([...demoCompanies.read(), row])
  return row
}

export async function updatePrivateCompany(id, data) {
  if (typeof id !== 'string' || !id.trim()) throw new Error('Identificador de empresa inválido.')
  const values = validarEmpresa(data, true)
  if (!isDemoRuntime) return entidadDe(await api.patch(COMPANIES_ENDPOINT, { ...values, id }))
  const rows = demoCompanies.read()
  if (!rows.some((row) => row.id === id)) throw new Error('La empresa ya no está disponible.')
  const updated = { ...rows.find((row) => row.id === id), ...values, id }
  demoCompanies.write(rows.map((row) => (row.id === id ? updated : row)))
  return updated
}
