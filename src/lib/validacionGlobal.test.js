import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { validarCampos } from 'owncoding-ui'
import {
  ETIQUETAS_GASTO,
  conteoAplicable,
  errorLineaCompra,
  puedeCanjearGiftCard,
  puedeTerminarConteo,
  reglasCompra,
  reglasGasto,
  reglasImpresora,
  reglasPromocion,
  reglasTransferencia,
  resumenFaltantes,
  valoresCompra,
  valoresGasto,
  valoresImpresora,
  valoresPromocion,
  valoresTransferencia,
} from './validacionGlobal.js'

const validar = (valores, reglas) => validarCampos(valores, reglas)

test('#297 · el resumen de faltantes nombra los campos en concreto', () => {
  assert.equal(resumenFaltantes(ETIQUETAS_GASTO, ['monto', 'descripcion']), 'Falta: el monto · la descripción.')
  assert.equal(resumenFaltantes(ETIQUETAS_GASTO, []), '')
  assert.equal(resumenFaltantes(ETIQUETAS_GASTO, ['otro']), 'Falta: otro.')
})

test('#297 · gasto vacío: monto y descripción obligatorios', () => {
  const form = { originalAmount: '', description: '', currency: 'PYG', exchangeRatePyg: '1' }
  const resultado = validar(valoresGasto(form), reglasGasto(form))
  assert.deepEqual(resultado.campos, ['monto', 'descripcion'])
  assert.match(resultado.errores.monto, /Completá el monto/)
  assert.match(resultado.errores.descripcion, /Completá la descripción/)
})

test('#297 · gasto con monto cero no cuenta como dato válido', () => {
  const form = { originalAmount: '0', description: 'Alquiler', currency: 'PYG', exchangeRatePyg: '1' }
  const resultado = validar(valoresGasto(form), reglasGasto(form))
  assert.deepEqual(resultado.campos, ['monto'])
  assert.match(resultado.errores.monto, /mayor a cero/)
})

test('#297 · gasto en otra moneda exige cotización y respeta el tope convertido', () => {
  const sinCotizacion = { originalAmount: '100', description: 'Proveedor', currency: 'USD', exchangeRatePyg: '' }
  assert.deepEqual(validar(valoresGasto(sinCotizacion), reglasGasto(sinCotizacion)).campos, ['cotizacion'])

  const completo = { originalAmount: '100', description: 'Proveedor', currency: 'USD', exchangeRatePyg: '7500' }
  assert.equal(validar(valoresGasto(completo), reglasGasto(completo)).valido, true)

  // 2 billones de Gs convertidos superan el tope general de 10.000 millones.
  const excedido = { originalAmount: '2000000', description: 'Proveedor', currency: 'USD', exchangeRatePyg: '7500' }
  assert.match(validar(valoresGasto(excedido), reglasGasto(excedido)).errores.monto, /supera el máximo/)
})

test('#297 · gasto en guaraníes no pide cotización', () => {
  const form = { originalAmount: '250000', description: 'Escribanía', currency: 'PYG', exchangeRatePyg: '1' }
  const resultado = validar(valoresGasto(form), reglasGasto(form))
  assert.equal(resultado.valido, true)
  assert.equal('cotizacion' in resultado.errores, false)
})

test('#297 · promoción vacía: código, nombre, descuento, inicio y fin', () => {
  const form = { code: ' ', name: '', kind: 'PERCENT', value: '', startsAt: '', endsAt: '', maxUnits: '' }
  const resultado = validar(valoresPromocion(form), reglasPromocion(form))
  assert.deepEqual(resultado.campos, ['code', 'name', 'value', 'startsAt', 'endsAt'])
})

test('#297 · promoción: porcentaje entero 1–100, fin posterior y límite válido', () => {
  const base = { code: 'VERANO', name: 'Verano', kind: 'PERCENT', value: '10', startsAt: '2026-01-01T10:00', endsAt: '2026-01-31T10:00', maxUnits: '' }
  assert.equal(validar(valoresPromocion(base), reglasPromocion(base)).valido, true)

  for (const value of ['0', '101', '10,5', 'abc']) {
    const form = { ...base, value }
    assert.ok(validar(valoresPromocion(form), reglasPromocion(form)).errores.value, `porcentaje ${value} debe fallar`)
  }

  const finAntes = { ...base, endsAt: '2025-12-31T10:00' }
  assert.match(validar(valoresPromocion(finAntes), reglasPromocion(finAntes)).errores.endsAt, /posterior al inicio/)

  const fija = { ...base, kind: 'FIXED', value: '5000', maxUnits: '10' }
  assert.equal(validar(valoresPromocion(fija), reglasPromocion(fija)).valido, true)

  const limiteCero = { ...fija, maxUnits: '0' }
  assert.match(validar(valoresPromocion(limiteCero), reglasPromocion(limiteCero)).errores.maxUnits, /entero mayor a cero/)

  const codigoInvalido = { ...base, code: 'con espacios' }
  assert.match(validar(valoresPromocion(codigoInvalido), reglasPromocion(codigoInvalido)).errores.code, /letras, números/)
})

test('#297 · impresora sin configuración no habilita el guardado', () => {
  const vacia = { nombre: '', conexion: 'lan', destinoUsb: '', ip: '192.168.1.23', puerto: '9100', copias: 1 }
  assert.deepEqual(validar(valoresImpresora(vacia), reglasImpresora(vacia)).campos, ['nombre'])

  const sinDestino = { nombre: 'Mostrador', conexion: 'lan', destinoUsb: '', ip: '', puerto: '', copias: 1 }
  assert.deepEqual(validar(valoresImpresora(sinDestino), reglasImpresora(sinDestino)).campos, ['ip', 'puerto'])

  const cupsVacia = { nombre: 'Mostrador', conexion: 'cups', destinoUsb: '  ', ip: '', puerto: '', copias: 1 }
  assert.deepEqual(validar(valoresImpresora(cupsVacia), reglasImpresora(cupsVacia)).campos, ['destinoUsb'])

  const completa = { nombre: 'Mostrador', conexion: 'lan', destinoUsb: '', ip: '192.168.1.23', puerto: '9100', copias: 1 }
  assert.equal(validar(valoresImpresora(completa), reglasImpresora(completa)).valido, true)

  const puertoInvalido = { ...completa, puerto: '70000' }
  assert.match(validar(valoresImpresora(puertoInvalido), reglasImpresora(puertoInvalido)).errores.puerto, /1 y 65535/)

  const copiasCero = { ...completa, copias: 0 }
  assert.match(validar(valoresImpresora(copiasCero), reglasImpresora(copiasCero)).errores.copias, /entre 1 y 9/)
})

test('#297 · compra incompleta: proveedor y cada línea', () => {
  const vacia = {
    supplierId: '', newSupplier: { name: '' }, suppliers: [], currency: 'PYG', exchangeRatePyg: '1',
    lines: [{ productId: '', quantity: '1', unitCostPyg: '0' }], requiereAuth: false, compraAuth: null,
  }
  const resultado = validar(valoresCompra(vacia), reglasCompra(vacia))
  assert.deepEqual(resultado.campos, ['proveedor', 'lineas'])
  assert.match(resultado.errores.lineas, /producto, cantidad y costo/)

  const completa = {
    ...vacia, supplierId: 'prov-1', suppliers: [{ id: 'prov-1' }],
    lines: [{ productId: 'prod-1', quantity: '2', unitCostPyg: '150000' }],
  }
  assert.equal(validar(valoresCompra(completa), reglasCompra(completa)).valido, true)

  const enDolares = { ...completa, currency: 'USD', exchangeRatePyg: '' }
  assert.deepEqual(validar(valoresCompra(enDolares), reglasCompra(enDolares)).campos, ['cotizacion'])

  const conCredito = { ...completa, requiereAuth: true, compraAuth: null }
  assert.deepEqual(validar(valoresCompra(conCredito), reglasCompra(conCredito)).campos, ['autorizacion'])

  const autorizada = { ...conCredito, compraAuth: { id: 'auth-1' } }
  assert.equal(validar(valoresCompra(autorizada), reglasCompra(autorizada)).valido, true)
})

test('#297 · la línea de compra explica qué falta', () => {
  assert.match(errorLineaCompra({ productId: '', quantity: '1', unitCostPyg: '0' }, 'PYG'), /producto/)
  assert.match(errorLineaCompra({ productId: 'p', quantity: '0', unitCostPyg: '0' }, 'PYG'), /cantidad/)
  assert.match(errorLineaCompra({ productId: 'p', quantity: '1', unitCostPyg: '-5' }, 'PYG'), /costo/)
  assert.equal(errorLineaCompra({ productId: 'p', quantity: '2', unitCostPyg: '1500' }, 'PYG'), '')
})

test('#297 · traslado sin campos: origen, destino, modelo y seriales', () => {
  const vacia = { sourceBranchId: '', destinationBranchId: '', productId: '', serials: '' }
  const sinAuth = valoresTransferencia(vacia, { puedeTransferirSinAuth: false, transferAuth: null })
  assert.deepEqual(validar(sinAuth, reglasTransferencia(vacia, { puedeTransferirSinAuth: false })).campos, ['origen', 'destino', 'producto', 'seriales', 'autorizacion'])

  const completa = { sourceBranchId: 'b1', destinationBranchId: 'b2', productId: 'p1', serials: 'AAA1, BBB2' }
  const valores = valoresTransferencia(completa, { puedeTransferirSinAuth: true, transferAuth: null })
  assert.equal(validar(valores, reglasTransferencia(completa, { puedeTransferirSinAuth: true })).valido, true)

  const mismoDestino = { ...completa, destinationBranchId: 'b1' }
  const repetido = valoresTransferencia(mismoDestino, { puedeTransferirSinAuth: true, transferAuth: null })
  assert.match(validar(repetido, reglasTransferencia(mismoDestino, { puedeTransferirSinAuth: true })).errores.destino, /distinto del origen/)

  const conAuth = valoresTransferencia(completa, { puedeTransferirSinAuth: false, transferAuth: { id: 'a1' } })
  assert.equal(validar(conAuth, reglasTransferencia(completa, { puedeTransferirSinAuth: false })).valido, true)
})

test('#297 · conteo físico y gift cards no avanzan sin datos', () => {
  assert.equal(conteoAplicable(null), false)
  assert.equal(conteoAplicable({ status: 'DRAFT', lines: [] }), false)
  assert.equal(conteoAplicable({ status: 'DRAFT', lines: [{ id: 'l1' }] }), true)
  assert.equal(conteoAplicable({ status: 'APPLIED', lines: [{ id: 'l1' }] }), false)

  assert.equal(puedeTerminarConteo(null), false)
  assert.equal(puedeTerminarConteo({ found: new Map() }), false)
  assert.equal(puedeTerminarConteo({ found: new Map([['serial', true]]) }), true)

  assert.equal(puedeCanjearGiftCard({ cantTotal: 0, totalGeneral: 0 }), false)
  assert.equal(puedeCanjearGiftCard({ cantTotal: 1, totalGeneral: 0 }), false)
  assert.equal(puedeCanjearGiftCard({ cantTotal: 2, totalGeneral: 180000 }), true)
  assert.equal(puedeCanjearGiftCard({ cantTotal: 2, totalGeneral: 180000, pendiente: 0 }), false)
  assert.equal(puedeCanjearGiftCard({ cantTotal: 2, totalGeneral: 180000, pendiente: 50000 }), true)
})

// Aserción de fuente (#297): los formularios mutantes de la regla global usan
// el contrato compartido. Si alguien vuelve a validar "solo al enviar", el
// test falla y obliga a pasar por `useValidacionFormulario`.
test('#297 · los formularios mutantes declaran sus reglas en la validación compartida', () => {
  const SRC = fileURLToPath(new URL('..', import.meta.url))
  const formularios = [
    'components/control/Gastos.jsx',
    'components/control/Compras.jsx',
    'components/control/Impresoras.jsx',
    'components/ventas/SellerPromotions.jsx',
    'components/control/Inventario.jsx',
  ]
  for (const ruta of formularios) {
    const codigo = readFileSync(join(SRC, ruta), 'utf8')
    assert.match(codigo, /useValidacionFormulario/, `${ruta} valida con el hook compartido`)
    assert.match(codigo, /disabled=\{[^}]*\.valido/, `${ruta} deshabilita la acción con el formulario incompleto`)
  }
  // POS: la gift card y los pagos no se cargan sin total por cobrar.
  for (const ruta of ['components/ventas/venta/PasoCobro.jsx', 'components/ventas/FormularioVenta.jsx']) {
    const codigo = readFileSync(join(SRC, ruta), 'utf8')
    assert.match(codigo, /puedeCanjearGiftCard/, `${ruta} usa la regla de gift cards`)
  }
  const inventario = readFileSync(join(SRC, 'components/control/Inventario.jsx'), 'utf8')
  assert.match(inventario, /conteoAplicable\(conteoDetalle\)/, 'el conteo documental exige líneas escaneadas')
  assert.match(inventario, /puedeTerminarConteo\(countSession\)/, 'el conteo rápido exige una lectura')
  // La API también rechaza el conteo vacío: no alcanza con esconder el botón.
  const api = readFileSync(fileURLToPath(new URL('../../backend/app/api/inventory-counts/route.ts', import.meta.url)), 'utf8')
  assert.match(api, /Escaneá al menos un equipo antes de aplicar el conteo/)
})
