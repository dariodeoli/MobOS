// Carga del estado de Impresión Pro y de los diseños predeterminados (con red).
import { api } from './api/client.js'
import { clientePlantillas } from './api/printTemplates.js'
import { DOCUMENTOS_CON_DISENO } from './printing/disenoPro.js'
import { moduloActivoImpresionPro } from './impresionPro.js'

export async function leerEstadoModulos() {
  try {
    const resultado = await api.get('/api/tenant/modules', { cacheMs: 0 })
    return resultado?.state || null
  } catch {
    // Sin respuesta no se apaga lo que la empresa ya tenía.
    return null
  }
}

/** Lector para `cargarDisenosPro`: módulo, predeterminados y plantillas de los documentos con diseño. */
export async function leerDisenosPro({ contexto, esDemo = false }) {
  const state = esDemo ? null : await leerEstadoModulos()
  const activo = moduloActivoImpresionPro(state, { esDemo })
  if (!activo) return { activo: false }
  const cliente = clientePlantillas(contexto, { demo: esDemo })
  const { effective = {} } = await cliente.defaults()
  const templates = []
  for (const kind of DOCUMENTOS_CON_DISENO) {
    if (!effective[kind]?.templateId) continue
    const lista = await cliente.list(kind)
    templates.push(...(lista.templates || []))
  }
  return { activo: true, effective, templates }
}
