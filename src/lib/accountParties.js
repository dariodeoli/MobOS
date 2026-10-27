import { api } from './api/client'
import { isDemoRuntime } from './demoMode'
import { nombreCompleto, textoBuscable, validarRevisionTitular } from './accountNames'
import { leerDemo, guardarDemo } from './demoStorage.js'
import { semillaEmpresasFiscalesDemo, semillaTitularesFiscalesDemo } from './demo/datosFiscales.js'
import { EMPRESA_DEMO } from './demo/empresa.js'

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
  validarRevisionTitular(data)
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

// La demo arranca con datos fiscales cargados (empresa y titulares ficticios):
// la primera lectura de la pestaña devuelve la semilla; después manda lo que la
// persona agregó o editó. Al salir de la demo la memoria se vacía y vuelve.
function demoStore(clave, semilla = () => []) {
  return {
    read() {
      try {
        const raw = leerDemo(clave, { demo: true })
        if (raw === null) return semilla()
        const rows = JSON.parse(raw)
        if (!Array.isArray(rows)) throw new Error()
        return rows
      } catch { throw new Error('Los datos privados guardados no son válidos. No se sobrescribieron.') }
    },
    write(rows) {
      try { guardarDemo(clave, JSON.stringify(rows), { demo: true }) }
      catch { throw new Error('No se pudieron guardar los datos privados en este navegador.') }
      return rows
    },
  }
}

const scope = empresaId => encodeURIComponent(empresaId || 'mobos-demo')
// Solo la empresa ficticia de la demo (Aurora) arranca cargada; cualquier otro
// alcance empieza vacío, así los datos no se cruzan entre empresas.
const semillaDe = (empresaId, semilla) => (scope(empresaId) === scope(EMPRESA_DEMO.id) ? semilla : () => [])
const demoHolders = empresaId => demoStore(`${HOLDERS_DEMO_KEY}:${scope(empresaId)}`, semillaDe(empresaId, semillaTitularesFiscalesDemo))
const demoCompanies = empresaId => demoStore(`${COMPANIES_DEMO_KEY}:${scope(empresaId)}`, semillaDe(empresaId, semillaEmpresasFiscalesDemo))
const fiscalDemo = data => Object.hasOwn(data, 'nameOfficial') ? { nameOfficial: data.nameOfficial, personConfirmed: data.personConfirmed === true } : {}

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
export async function getAccountHolders({ demo = isDemoRuntime, empresaId } = {}) {
  if (demo) return demoHolders(empresaId).read()
  return listaDe(await api.get(HOLDERS_ENDPOINT))
}

export async function createAccountHolder(data, { demo = isDemoRuntime, empresaId } = {}) {
  const values = validarTitular(data)
  if (!demo) return entidadDe(await api.post(HOLDERS_ENDPOINT, values))
  const row = { ...values, ...fiscalDemo(data), id: `demo-${globalThis.crypto.randomUUID()}` }
  demoHolders(empresaId).write([...demoHolders(empresaId).read(), row])
  return row
}

export async function updateAccountHolder(id, data, { demo = isDemoRuntime, empresaId } = {}) {
  if (typeof id !== 'string' || !id.trim()) throw new Error('Identificador de titular inválido.')
  const values = validarTitular(data, true)
  if (!demo) return entidadDe(await api.patch(HOLDERS_ENDPOINT, { ...values, id }))
  const rows = demoHolders(empresaId).read()
  if (!rows.some((row) => row.id === id)) throw new Error('El titular ya no está disponible.')
  const updated = { ...rows.find((row) => row.id === id), ...values, ...fiscalDemo(data), id }
  demoHolders(empresaId).write(rows.map((row) => (row.id === id ? updated : row)))
  return updated
}

// ── Empresas/personas jurídicas privadas ──────────────────────────────
export async function getPrivateCompanies({ demo = isDemoRuntime, empresaId } = {}) {
  if (demo) return demoCompanies(empresaId).read()
  return listaDe(await api.get(COMPANIES_ENDPOINT))
}

export async function createPrivateCompany(data, { demo = isDemoRuntime, empresaId } = {}) {
  const values = validarEmpresa(data)
  if (!demo) return entidadDe(await api.post(COMPANIES_ENDPOINT, values))
  const row = { ...values, id: `demo-${globalThis.crypto.randomUUID()}` }
  demoCompanies(empresaId).write([...demoCompanies(empresaId).read(), row])
  return row
}

export async function updatePrivateCompany(id, data, { demo = isDemoRuntime, empresaId } = {}) {
  if (typeof id !== 'string' || !id.trim()) throw new Error('Identificador de empresa inválido.')
  const values = validarEmpresa(data, true)
  if (!demo) return entidadDe(await api.patch(COMPANIES_ENDPOINT, { ...values, id }))
  const rows = demoCompanies(empresaId).read()
  if (!rows.some((row) => row.id === id)) throw new Error('La empresa ya no está disponible.')
  const updated = { ...rows.find((row) => row.id === id), ...values, id }
  demoCompanies(empresaId).write(rows.map((row) => (row.id === id ? updated : row)))
  return updated
}
