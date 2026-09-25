// Estados del taller compartidos por la tabla interna, el tablero por etapas
// (#215/#241), la ficha del cliente y el portal (#240 §4). Una sola fuente para
// etiquetas, tonos y avance del pipeline (crear → avanzar → entregar).
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

// Avance del pipeline del taller: la etapa siguiente de cada estado. Las
// entregadas y canceladas no avanzan (no tienen siguiente).
export const SIGUIENTE_SERVICIO = {
  RECIBIDO: 'DIAGNOSTICO',
  DIAGNOSTICO: 'CON_TECNICO',
  CON_TECNICO: 'ESPERANDO_REPUESTO',
  ESPERANDO_REPUESTO: 'REPARADO',
  REPARADO: 'LISTO',
  LISTO: 'ENTREGADO',
}
