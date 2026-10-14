// Encabezado y pie ESC/POS compartidos (#426): el mismo orden que el
// comprobante de venta aprobado — empresa, razón social, RUC, dirección,
// sucursal y contacto; tipo de documento, número grande y fecha; y al final
// «Generado por MobOS para <empresa>». Lo usan todos los tickets.
import { APP_NAME } from '../brand.js'
import { datosEncabezado } from './empresaImpresion.js'

const fechaHora = (valor) => (valor ? new Date(valor).toLocaleString('es-PY', { dateStyle: 'short', timeStyle: 'short' }) : '')

/**
 * @param {object} t Ticket de `crearTicket`.
 * @param {string} titulo Tipo de documento (se imprime tal cual).
 * @param {object} [opciones] `numero`, `fecha` y `empresa` ({ tenant, branch } o
 *   un nombre) que manda sobre la empresa de la sesión.
 */
export function encabezadoTicket(t, titulo, { numero = '', fecha = '', empresa = null, cerrar = true } = {}) {
  const fuente = typeof empresa === 'string' ? { tenant: { name: empresa } } : (empresa || {})
  const datos = datosEncabezado(fuente)
  t.negrita().centrado(datos.razon || APP_NAME).negrita(false)
  for (const linea of datos.lineas) t.centrado(linea)
  t.linea('=')
  t.negrita().centrado(titulo).negrita(false)
  if (numero) t.doble().centrado(String(numero)).doble(false)
  if (fecha) t.centrado(fechaHora(fecha))
  if (cerrar) t.linea()
  return datos
}

/** Línea final «Generado por MobOS para <empresa>» (más la leyenda propia). */
export function pieTicket(t, { leyenda = 'Documento no fiscal.', empresa = null, regla = true } = {}) {
  const fuente = typeof empresa === 'string' ? { tenant: { name: empresa } } : (empresa || {})
  const nombre = datosEncabezado(fuente).razon
  if (regla) t.linea()
  t.centrado(`${leyenda ? `${leyenda} ` : ''}Generado por ${APP_NAME}${nombre ? ` para ${nombre.replace(/\.$/, '')}` : ''}.`)
  return t
}
