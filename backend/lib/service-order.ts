// Estados del taller y su lectura para las superficies del cliente (portal,
// cronología y ficha). El pipeline y su validación viven en la ruta del taller;
// acá solo se traduce a lenguaje de cliente y se acota el detalle que puede
// salir del CRM (nunca costos, notas internas ni el secreto de desbloqueo).
export const ESTADO_SERVICIO: Record<string, string> = {
  RECIBIDO: 'Recibido',
  DIAGNOSTICO: 'Diagnóstico',
  CON_TECNICO: 'Con técnico',
  ESPERANDO_REPUESTO: 'Esperando repuesto',
  REPARADO: 'Reparado',
  LISTO: 'Listo para retirar',
  ENTREGADO: 'Entregado',
  CANCELADO: 'Cancelado',
}

export const etiquetaServicio = (estado: unknown): string => ESTADO_SERVICIO[String(estado || '')] || String(estado || '')
