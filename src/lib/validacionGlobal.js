// Regla global #297: sin datos válidos no hay acción mutante habilitada.
//
// Cada formulario declara acá sus reglas puras (el mismo contrato de
// `validarCampos` de owncoding-ui) y las etiquetas de sus campos. La pantalla
// usa `useValidacionFormulario` para mostrar el mensaje al salir del campo, el
// botón deshabilitado con el motivo y el resumen de faltantes; el submit
// vuelve a pasar por las mismas reglas, así ninguna acción se dispara con el
// formulario incompleto. Nada de esto toca el DOM: es lógica testeable.
import { obligatorio, patron } from 'owncoding-ui'
import { LIMITE_MONTO_GENERAL, excedeMonto } from '../utils/moneda.js'

/** "Falta: el monto · la descripción." (o '' si no falta nada). */
export function resumenFaltantes(etiquetas, campos) {
  const nombres = (campos || []).map((campo) => etiquetas[campo] || campo)
  return nombres.length ? `Falta: ${nombres.join(' · ')}.` : ''
}

const positivo = (mensaje) => (valor) => (Number(valor) > 0 ? '' : mensaje)

// ── Gastos (#297) ────────────────────────────────────────────────────
export const ETIQUETAS_GASTO = { monto: 'el monto', cotizacion: 'la cotización', descripcion: 'la descripción' }

// Monto tipeado tal como se ve en el campo (con separadores); 0 si está vacío.
const numeroDeMonto = (valor) => {
  const texto = String(valor ?? '').trim().replace(/\./g, '').replace(',', '.')
  return texto ? Number(texto) : 0
}

export function valoresGasto(form) {
  return {
    monto: form.originalAmount,
    cotizacion: form.currency === 'PYG' ? null : form.exchangeRatePyg,
    descripcion: form.description,
  }
}

export function reglasGasto(form) {
  return {
    monto: [
      obligatorio('Completá el monto.'),
      (valor) => (numeroDeMonto(valor) > 0 ? '' : 'El monto tiene que ser mayor a cero.'),
      (valor) => {
        const convertido = form.currency === 'PYG' ? numeroDeMonto(valor) : Math.round(numeroDeMonto(valor) * numeroDeMonto(form.exchangeRatePyg))
        return excedeMonto(convertido, LIMITE_MONTO_GENERAL) ? 'El monto supera el máximo que el sistema puede guardar.' : ''
      },
    ],
    ...(form.currency !== 'PYG' ? { cotizacion: [obligatorio('Completá la cotización en guaraníes.'), positivo('La cotización tiene que ser mayor a cero.')] } : {}),
    descripcion: [obligatorio('Completá la descripción.')],
  }
}

// ── Promociones (#297) ───────────────────────────────────────────────
export const ETIQUETAS_PROMOCION = { code: 'el código', name: 'el nombre', value: 'el descuento', startsAt: 'el inicio', endsAt: 'el fin', maxUnits: 'el límite de unidades' }

export function valoresPromocion(form) {
  return {
    code: String(form.code || '').trim(),
    name: String(form.name || '').trim(),
    value: form.value,
    startsAt: form.startsAt,
    endsAt: form.endsAt,
    maxUnits: form.maxUnits,
  }
}

export function reglasPromocion(form) {
  return {
    code: [
      obligatorio('Completá el código.'),
      patron(/^[A-Za-z0-9_-]{2,40}$/, 'Usá entre 2 y 40 letras, números, guion o guion bajo.'),
    ],
    name: [obligatorio('Completá el nombre.')],
    value: [
      obligatorio('Completá el descuento.'),
      (valor) => {
        if (String(valor ?? '').trim() === '') return ''
        const numero = Number(String(valor).replace(',', '.'))
        if (!Number.isFinite(numero)) return 'Revisá el descuento.'
        if (form.kind === 'PERCENT') {
          if (!Number.isSafeInteger(numero) || numero < 1 || numero > 100) return 'El porcentaje debe ser un entero entre 1 y 100.'
          return ''
        }
        return numero > 0 ? '' : 'El monto por unidad tiene que ser mayor a cero.'
      },
    ],
    startsAt: [obligatorio('Elegí cuándo empieza.')],
    endsAt: [
      obligatorio('Elegí cuándo termina.'),
      (valor) => {
        if (String(valor ?? '').trim() === '' || String(form.startsAt ?? '').trim() === '') return ''
        return new Date(valor).getTime() > new Date(form.startsAt).getTime() ? '' : 'El fin debe ser posterior al inicio.'
      },
    ],
    maxUnits: [
      (valor) => {
        if (String(valor ?? '').trim() === '') return ''
        const numero = Number(valor)
        return Number.isSafeInteger(numero) && numero > 0 ? '' : 'El límite tiene que ser un entero mayor a cero.'
      },
    ],
  }
}

// ── Impresoras (#297) ────────────────────────────────────────────────
export const ETIQUETAS_IMPRESORA = { nombre: 'el nombre', destinoUsb: 'la cola CUPS', ip: 'la IP', puerto: 'el puerto', copias: 'las copias' }

export function valoresImpresora(form) {
  return {
    nombre: String(form.nombre || '').trim(),
    destinoUsb: String(form.destinoUsb || '').trim(),
    ip: String(form.ip || '').trim(),
    puerto: String(form.puerto || '').trim(),
    copias: form.copias,
  }
}

export function reglasImpresora(form) {
  const cups = form.conexion === 'cups'
  return {
    nombre: [obligatorio('Poné un nombre visible para reconocer la impresora.')],
    ...(cups
      ? { destinoUsb: [obligatorio('Elegí la cola CUPS local.')] }
      : {
          ip: [obligatorio('Completá la IP de la impresora.')],
          puerto: [
            obligatorio('Completá el puerto.'),
            (valor) => {
              const numero = Number(valor)
              return Number.isSafeInteger(numero) && numero >= 1 && numero <= 65535 ? '' : 'El puerto tiene que estar entre 1 y 65535.'
            },
          ],
        }),
    copias: [
      (valor) => {
        const numero = Number(valor)
        return Number.isSafeInteger(numero) && numero >= 1 && numero <= 9 ? '' : 'Las copias tienen que ser un entero entre 1 y 9.'
      },
    ],
  }
}

// ── Compras (#297) ───────────────────────────────────────────────────
export const ETIQUETAS_COMPRA = { proveedor: 'el proveedor', cotizacion: 'la cotización', lineas: 'las líneas', autorizacion: 'la autorización' }

export function valoresCompra({ supplierId, newSupplier, suppliers, currency, exchangeRatePyg, lines, requiereAuth, compraAuth }) {
  const proveedorElegido = supplierId === 'new'
    ? String(newSupplier?.name || '').trim()
    : ((suppliers || []).some((item) => item.id === supplierId) ? supplierId : '')
  return {
    proveedor: proveedorElegido,
    cotizacion: currency === 'PYG' ? 'ok' : exchangeRatePyg,
    lineas: lines,
    autorizacion: requiereAuth ? (compraAuth ? 'ok' : '') : 'ok',
  }
}

/** Error concreto de una línea de compra, o '' si está completa. */
export function errorLineaCompra(line, currency) {
  if (!line.productId) return 'Elegí el producto.'
  const cantidad = Number(line.quantity)
  if (!Number.isSafeInteger(cantidad) || cantidad <= 0) return 'La cantidad tiene que ser un entero mayor a cero.'
  const costo = Number(String(line.unitCostPyg ?? '').replace(/\./g, '').replace(',', '.'))
  if (currency === 'PYG') {
    if (!Number.isSafeInteger(costo) || costo < 0) return 'El costo tiene que ser un entero mayor o igual a cero.'
  } else if (!Number.isFinite(costo) || costo < 0) {
    return 'El costo tiene que ser un número mayor o igual a cero.'
  }
  return ''
}

export function reglasCompra(form) {
  return {
    proveedor: [obligatorio('Elegí un proveedor o completá el nombre del nuevo.')],
    ...(form.currency !== 'PYG' ? { cotizacion: [obligatorio('Indicá la cotización en guaraníes.'), positivo('La cotización tiene que ser mayor a cero.')] } : {}),
    lineas: [
      (valor) => {
        const lista = Array.isArray(valor) ? valor : []
        if (!lista.length) return 'Agregá al menos una línea.'
        return lista.every((line) => !errorLineaCompra(line, form.currency)) ? '' : 'Completá producto, cantidad y costo en cada línea.'
      },
    ],
    autorizacion: [(valor) => (valor ? '' : 'La compra a crédito necesita autorización de gerencia.')],
  }
}

// ── Traslados (#297) ─────────────────────────────────────────────────
export const ETIQUETAS_TRANSFERENCIA = { origen: 'el origen', destino: 'el destino', producto: 'el modelo', seriales: 'al menos un IMEI/serial', autorizacion: 'la autorización' }

export function valoresTransferencia(form, { puedeTransferirSinAuth, transferAuth }) {
  return {
    origen: form.sourceBranchId,
    destino: form.destinationBranchId,
    producto: form.productId,
    seriales: String(form.serials || '').split(/[\n,;]+/).map((serial) => serial.trim()).filter(Boolean),
    autorizacion: puedeTransferirSinAuth || transferAuth ? 'ok' : '',
  }
}

export function reglasTransferencia(form, { puedeTransferirSinAuth }) {
  return {
    origen: [obligatorio('Elegí la sucursal de origen.')],
    destino: [
      obligatorio('Elegí la sucursal de destino.'),
      (valor) => (valor && valor === form.sourceBranchId ? 'El destino tiene que ser distinto del origen.' : ''),
    ],
    producto: [obligatorio('Elegí el modelo a trasladar.')],
    seriales: [(valor) => (Array.isArray(valor) && valor.length ? '' : 'Indicá al menos un IMEI/serial.')],
    ...(puedeTransferirSinAuth ? {} : { autorizacion: [(valor) => (valor ? '' : 'Solicitá la autorización de gerencia para transferir.')] }),
  }
}

// ── Conteo físico y gift cards (#297) ────────────────────────────────
/** El conteo documental recién se aplica con al menos un equipo escaneado. */
export function conteoAplicable(conteoDetalle) {
  return Boolean(conteoDetalle?.status === 'DRAFT' && (conteoDetalle?.lines || []).length > 0)
}

/** El conteo rápido no termina sin una lectura: no hay resultado que mostrar. */
export function puedeTerminarConteo(countSession) {
  return Number(countSession?.found?.size || 0) > 0
}

/** Canjear una gift card necesita productos y un saldo real por cobrar. */
export function puedeCanjearGiftCard({ cantTotal, totalGeneral, pendiente } = {}) {
  if (!(Number(cantTotal) > 0) || !(Number(totalGeneral) > 0)) return false
  return pendiente === undefined ? true : Number(pendiente) > 0
}
