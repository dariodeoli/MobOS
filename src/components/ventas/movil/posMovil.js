// Reglas del POS en celular (#429), sin JSX para poder testearlas. Toda la
// lógica de venta sigue en FormularioVenta; acá solo viven las decisiones de
// presentación del flujo paso a paso (medios, división, vuelto, sin stock).
import { updateAccountPayment } from '../../../utils/pagoCuenta.js'
import { MEDIOS_PAGO } from '../../../lib/catalog.js'
import { LIMITE_MONTO_VENTAS } from '../../../utils/moneda.js'

export const CONSULTA_MOVIL = '(max-width: 767px)'

// «Pago», «Segundo pago», «Tercer pago»… según cuántos pagos hay cargados.
const ORDINALES = ['Pago', 'Segundo pago', 'Tercer pago', 'Cuarto pago', 'Quinto pago', 'Sexto pago']
export const tituloPago = cantidadCargada => ORDINALES[Math.min(Math.max(0, cantidadCargada), ORDINALES.length - 1)]

// Solo dígitos: el teclado propio entrega texto limpio.
export const soloDigitos = valor => String(valor ?? '').replace(/\D/g, '')

// Monto del teclado topado al límite de ventas.
export function montoDeTeclado(valor) {
  const digitos = soloDigitos(valor).replace(/^0+(?=\d)/, '')
  return Math.min(Number(digitos) || 0, LIMITE_MONTO_VENTAS)
}

// Cuentas que se cobran con un toque: activas, en guaraníes y que no piden
// datos extra (el canje pide equipo; USD/BRL piden cotización). El resto se
// cobra desde «Otros medios» con el formulario completo.
export function cuentasRapidas(cuentas) {
  return (cuentas || []).filter(cuenta => cuenta.isActive && cuenta.currency === 'PYG' && cuenta.kind !== 'TRADE_IN')
}

export const esEfectivo = cuenta => cuenta?.kind === 'CASH'

// Medios sin cuentas configuradas (cobro legacy): los de siempre.
export const mediosLegacy = () => MEDIOS_PAGO.map(nombre => ({ id: nombre, name: nombre, kind: nombre === 'DINERO' ? 'CASH' : 'TRANSFER', legacy: true }))

// Fila de pago lista para `setPagos`, con la misma forma que arma el cobro de
// escritorio (cuenta + monto en guaraníes). `monto` entra en guaraníes enteros.
export function pagoDeMedio(medio, monto) {
  const importe = String(Math.max(0, Math.round(Number(monto) || 0)))
  if (medio.legacy) return { medioPago: medio.name, cuenta: '', monto: importe }
  const base = { medioPago: MEDIOS_PAGO[0], cuenta: '', monto: '', accountId: '', originalAmount: '', exchangeRatePyg: '' }
  return updateAccountPayment(base, { accountId: medio.id, originalAmount: importe }, [medio])
}

// Vuelto de un pago en efectivo: lo recibido menos lo que se aplica a la venta.
export const vueltoEfectivo = (recibido, aplicado) => Math.max(0, Math.round(Number(recibido) || 0) - Math.round(Number(aplicado) || 0))

// «Vender igual» (producto sin stock): solo con permiso y nunca para equipos
// con IMEI/serie (cada unidad es única: se elige la exacta o no se vende).
export function puedeVenderIgual({ permiso, motivo }) {
  return Boolean(permiso) && motivo === 'stock'
}

// Líneas del carrito que frenan el cobro, separadas por lo que se puede hacer.
export function clasificarPendientes(pendientes, permiso) {
  const lista = pendientes || []
  return {
    sinStock: lista.filter(p => p.motivo === 'stock'),
    conImei: lista.filter(p => p.motivo === 'imei'),
    puedeVenderIgual: lista.every(p => puedeVenderIgual({ permiso, motivo: p.motivo })),
  }
}

// Rótulo del botón que guarda la venta (mismas palabras que el cobro de
// escritorio): confirma si está pago, crea el pedido si queda saldo.
export function etiquetaConfirmar({ guardando, valido, totalGeneral, totalPagado, venderACredito, pagaAlRecibir }) {
  if (guardando) return 'Guardando venta…'
  if (!valido) return 'Guardar pedido'
  if (totalGeneral > 0 && totalPagado >= totalGeneral) return 'Confirmar venta'
  if (totalPagado <= 0) {
    if (venderACredito) return 'Crear pedido a crédito'
    return pagaAlRecibir ? 'Crear pedido · paga al recibir' : 'Crear pedido sin pago'
  }
  return 'Crear pedido'
}

// Texto corto del carrito para la barra fija: «3 artículos».
export const textoArticulos = cantidad => `${cantidad} ${cantidad === 1 ? 'artículo' : 'artículos'}`
