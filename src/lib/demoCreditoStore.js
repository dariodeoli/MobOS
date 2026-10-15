// Conecta las reglas del crédito demo (demoCredito.js) con el almacén de ventas
// de la demo. Es lo que usa la interfaz; las reglas se prueban sin navegador.
import { listVentas, updateVenta } from './storage.js'
import * as reglas from './demoCredito.js'

const almacen = { listar: () => listVentas(), actualizar: (id, cambios) => updateVenta(id, cambios) }

export const { autorizacionCreditoDemo, evaluarCreditoDemo, deudaDemoDeCliente, esAprobadorDemo } = reglas
export const resolverCreditoDemo = (args) => reglas.resolverCreditoDemo({ ...args, almacen })
export const marcarEntregaDemo = (args) => reglas.marcarEntregaDemo({ ...args, almacen })
export const autorizacionesCreditoDemo = () => reglas.autorizacionesCreditoDemo(almacen)
