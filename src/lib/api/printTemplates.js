import { api } from './client'
import {
  PRESETS_PLANTILLA,
  clonarPlantilla,
  erroresPlantilla,
  nombrePlantillaValido,
} from '../printing/plantillas.js'
const demoEmpresas = new Map()
export const identidadPlantillas = c =>
  JSON.stringify([
    c?.empresaId,
    c?.userId,
    c?.sucursalId || null,
    c?.role,
    [...(c?.permissions || [])].sort(),
  ])
function error(code, message) {
  return Object.assign(Error(message), { code })
}
function storeDemo(company) {
  if (!demoEmpresas.has(company)) demoEmpresas.set(company, { templates: [], defaults: {} })
  return demoEmpresas.get(company)
}
// Sin caché compartida. Cada instancia se ata al contexto y desestima respuestas
// tardías: cambiar empresa/usuario/sucursal no aplica A ni sus avisos sobre B.
export function clientePlantillas(
  contexto,
  { demo = false, actual = () => contexto, transport = api } = {},
) {
  const identity = identidadPlantillas(contexto)
  const check = () => {
    if (!contexto?.empresaId || !contexto?.userId || identidadPlantillas(actual()) !== identity)
      throw error('CONTEXT_CHANGED', 'Cambió el contexto. Volvé a abrir Plantillas.')
  }
  const edit = () => {
    check()
    if (contexto.role !== 'ADMIN')
      throw error('FORBIDDEN', 'Solo administración puede guardar plantillas de empresa.')
  }
  const request = async (real, local, write = false) => {
    if (write) edit()
    else check()
    const result = demo ? await local(storeDemo(contexto.empresaId)) : await real()
    check()
    return clonarPlantilla(result)
  }
  const valid = (kind, name, definition) => {
    if (!nombrePlantillaValido(name))
      throw error('VALIDATION', 'Nombre: hasta 80 letras, números o separadores simples.')
    const errors = erroresPlantilla(kind, definition)
    if (errors.length) throw error('VALIDATION', errors.join(' '))
  }
  const row = (s, id, revision) => {
    const t = s.templates.find(t => t.id === id)
    if (!t) throw error('NOT_FOUND', 'La plantilla ya no está disponible.')
    if (revision !== undefined && t.revision !== revision)
      throw error('CONFLICT', 'Otra sesión cambió esta plantilla. Actualizá antes de guardar.')
    return t
  }
  const path = id => `/api/print/templates/${encodeURIComponent(id)}`
  return {
    list: kind =>
      request(
        () =>
          transport.get(`/api/print/templates${kind ? `?kind=${encodeURIComponent(kind)}` : ''}`, {
            cacheMs: 0,
          }),
        s => ({
          templates: s.templates.filter(t => !kind || t.kind === kind),
          presets: PRESETS_PLANTILLA.filter(t => !kind || t.kind === kind),
        }),
      ),
    create: data => {
      valid(data.kind, data.name, data.definition)
      return request(
        () => transport.post('/api/print/templates', data),
        s => {
          const t = {
            ...clonarPlantilla(data),
            id: `demo-template-${globalThis.crypto.randomUUID()}`,
            revision: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
          s.templates.push(t)
          return t
        },
        true,
      )
    },
    update: (id, data) =>
      request(
        () => transport.patch(path(id), data),
        s => {
          const t = row(s, id, data.revision),
            next = { ...t, ...data }
          valid(t.kind, next.name, next.definition)
          Object.assign(t, next, { revision: t.revision + 1, updatedAt: new Date().toISOString() })
          return t
        },
        true,
      ),
    remove: (id, revision) =>
      request(
        () => transport.delete(path(id), { body: { revision } }),
        s => {
          row(s, id, revision)
          s.templates = s.templates.filter(t => t.id !== id)
          for (const key of Object.keys(s.defaults))
            if (s.defaults[key].templateId === id) delete s.defaults[key]
          return { deleted: true, id }
        },
        true,
      ),
    action: (id, data) =>
      request(
        () => transport.post(path(id), data),
        s => {
          const t = row(s, id, data.revision)
          if (data.action === 'duplicate') {
            const name = data.name || `${t.name} copia`
            valid(t.kind, name, t.definition)
            const now = new Date().toISOString()
            const copy = {
              ...clonarPlantilla(t),
              id: `demo-template-${globalThis.crypto.randomUUID()}`,
              name,
              revision: 1,
              createdAt: now,
              updatedAt: now,
            }
            s.templates.push(copy)
            return copy
          }
          if (data.action !== 'restore') throw error('VALIDATION', 'Acción no admitida.')
          t.definition = clonarPlantilla(PRESETS_PLANTILLA.find(p => p.kind === t.kind).definition)
          t.revision++
          t.updatedAt = new Date().toISOString()
          return t
        },
        true,
      ),
    defaults: () =>
      request(
        () =>
          transport.get(
            `/api/print/templates/defaults${contexto.sucursalId ? `?branchId=${encodeURIComponent(contexto.sucursalId)}` : ''}`,
            { cacheMs: 0 },
          ),
        s => {
          const effective = {}
          for (const p of PRESETS_PLANTILLA) {
            const branch = s.defaults[`${contexto.sucursalId}:${p.kind}`],
              company = s.defaults[`company:${p.kind}`]
            effective[p.kind] = {
              templateId: (branch || company)?.templateId || null,
              source: branch ? 'branch' : company ? 'company' : 'builtin',
            }
          }
          return {
            defaults: Object.values(s.defaults).filter(
              d => d.branchId === null || d.branchId === contexto.sucursalId,
            ),
            effective,
          }
        },
      ),
    setDefault: data =>
      request(
        () => transport.put('/api/print/templates/defaults', data),
        s => {
          if (!PRESETS_PLANTILLA.some(p => p.kind === data.kind))
            throw error('VALIDATION', 'Tipo no admitido.')
          if (data.templateId && row(s, data.templateId).kind !== data.kind)
            throw error('VALIDATION', 'El tipo no coincide.')
          const key = `${data.branchId || 'company'}:${data.kind}`
          if (data.templateId) s.defaults[key] = { ...data }
          else delete s.defaults[key]
          return { ...data }
        },
        true,
      ),
  }
}
