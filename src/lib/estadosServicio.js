// Estados del taller compartidos por la tabla interna, la ficha del cliente y
// el portal (#240 §4). Una sola fuente para etiquetas y tonos; el pipeline
// (crear → avanzar → entregar) vive en `ServicioTecnico`.
export const ESTADOS_SERVICIO = [
  ['RECIBIDO', 'Recibido', 'slate'],
  ['DIAGNOSTICO', 'Diagnóstico', 'blue'],
  ['CON_TECNICO', 'Con técnico', 'blue'],
  ['ESPERANDO_REPUESTO', 'Esperando repuesto', 'orange'],
  ['REPARADO', 'Reparado', 'green'],
  ['LISTO', 'Listo para retirar', 'green'],
  ['ENTREGADO', 'Entregado', 'slate'],
  ['CANCELADO', 'Cancelado', 'red'],
]

export const ESTADO_SERVICIO_LABEL = Object.fromEntries(ESTADOS_SERVICIO.map(([id, label]) => [id, label]))
export const ESTADO_SERVICIO_TONO = Object.fromEntries(ESTADOS_SERVICIO.map(([id, , tono]) => [id, tono]))

export const etiquetaServicio = (estado) => ESTADO_SERVICIO_LABEL[estado] || estado || ''
export const tonoServicio = (estado) => ESTADO_SERVICIO_TONO[estado] || 'slate'
// Tono del chip público del portal (ok/warn/bad/info/neutro): el mismo estado
// se lee igual en todas las superficies del cliente.
export const tonoServicioPortal = (estado) => (
  estado === 'REPARADO' || estado === 'LISTO' ? 'ok'
    : estado === 'ESPERANDO_REPUESTO' ? 'warn'
      : estado === 'CANCELADO' ? 'bad'
        : estado === 'ENTREGADO' ? 'neutro'
          : 'info'
)
