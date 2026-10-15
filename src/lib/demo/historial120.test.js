// #451: generadores de la demo completa (120 días, accesorios, medios de pago,
// vendedores). Puros y deterministas: corren en node sin almacenamiento.
import test from 'node:test'
import assert from 'node:assert/strict'
import { generarVentasHistorial, DIAS_HISTORIAL, VENDEDORES_PESO } from './ventasHistorial.js'
import { ACCESORIOS_DEMO, CATALOGO_VENTA } from './catalogoPro.js'
import { conFotosDemo } from './fotosAccesorios.js'
import { VENTAS_DEMO, ventasDemoLegacy, totalDeVenta, totalPagado } from './ventas.js'

// Mediodía local: evita saltos de día por zona horaria al restar días.
const HOY = new Date(2026, 9, 15, 12, 0, 0)
const historial = generarVentasHistorial({ hoy: HOY })

const luhnValido = (texto) => {
  let suma = 0
  for (let i = 0; i < texto.length; i += 1) {
    let d = Number(texto[texto.length - 1 - i])
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9 }
    suma += d
  }
  return suma % 10 === 0
}

test('#451 · el historial es determinista', () => {
  assert.deepEqual(generarVentasHistorial({ hoy: HOY }), historial)
  assert.notDeepEqual(generarVentasHistorial({ hoy: HOY, semilla: 7 }), historial)
})

test('#451 · hay ventas repartidas en 120 días y los gráficos de 30/90 días están llenos', () => {
  const porDia = new Map()
  for (const venta of historial) porDia.set(venta.diasAtras, (porDia.get(venta.diasAtras) || 0) + 1)
  assert.ok(Math.max(...porDia.keys()) >= DIAS_HISTORIAL - 2, 'llega hasta ~120 días atrás')
  const diasConVentas = (desde, hasta) => [...Array(hasta - desde + 1).keys()].filter((i) => porDia.has(desde + i)).length
  assert.ok(diasConVentas(0, 29) >= 27, '30 días casi sin huecos')
  assert.ok(diasConVentas(0, 89) >= 80, '90 días casi sin huecos')
  assert.ok(historial.length >= 250, `volumen suficiente (${historial.length})`)
})

test('#451 · ritmo semanal y de quincena: viernes/sábado venden más que lunes/martes', () => {
  const suma = { fuerte: 0, flojo: 0 }
  const dias = { fuerte: 0, flojo: 0 }
  for (let d = 0; d < DIAS_HISTORIAL; d += 1) {
    const fecha = new Date(HOY)
    fecha.setDate(fecha.getDate() - d)
    const clave = [5, 6].includes(fecha.getDay()) ? 'fuerte' : [1, 2].includes(fecha.getDay()) ? 'flojo' : null
    if (!clave) continue
    dias[clave] += 1
    suma[clave] += historial.filter((v) => v.diasAtras === d).reduce((s, v) => s + totalDeVenta(v), 0)
  }
  assert.ok(suma.fuerte / dias.fuerte > (suma.flojo / dias.flojo) * 1.3)
})

test('#451 · total = líneas + delivery y cobrado + saldo = total (sin sobrepagos)', () => {
  for (const venta of ventasDemoLegacy()) {
    assert.equal(venta.totalPyg, venta.precio + venta.montoDelivery, `${venta.id}: total`)
    assert.equal(venta.totalPagado + venta.totalPendiente, venta.totalPyg, `${venta.id}: pagos + saldo = total`)
    assert.ok(venta.totalPagado <= venta.totalPyg, `${venta.id}: sin sobrepago`)
    assert.ok(venta.totalPendiente >= 0)
    for (const item of venta.items) assert.equal(item.totalPyg, item.quantity * item.unitPricePyg, `${venta.id}: cantidad × precio`)
  }
  for (const venta of VENTAS_DEMO) assert.ok(totalPagado(venta) <= totalDeVenta(venta), `${venta.id}: pagos ≤ total`)
})

test('#451 · ids y números únicos, y todos los IMEI son de aspecto real (15 dígitos, 35…, Luhn)', () => {
  assert.equal(new Set(VENTAS_DEMO.map((v) => v.id)).size, VENTAS_DEMO.length)
  assert.equal(new Set(VENTAS_DEMO.map((v) => v.numero)).size, VENTAS_DEMO.length)
  const imeis = VENTAS_DEMO.flatMap((v) => v.items.flatMap((i) => i.seriales || []))
  assert.ok(imeis.length >= 20)
  assert.equal(new Set(imeis).size, imeis.length, 'IMEI únicos')
  for (const imei of imeis) {
    assert.match(imei, /^35\d{13}$/)
    assert.ok(luhnValido(imei), `${imei}: Luhn`)
  }
})

test('#451 · medios de pago, vendedores, entregas y saldos variados', () => {
  const pagos = VENTAS_DEMO.flatMap((v) => v.pagos)
  const medios = new Set(pagos.map((p) => p.medioPago))
  for (const medio of ['DINERO', 'DINERO USD', 'TRANSFERENCIA', 'POS UENO', 'QR', 'SALDO A FAVOR', 'GIFT CARD']) assert.ok(medios.has(medio), `falta ${medio}`)
  const bancos = new Set(pagos.filter((p) => p.medioPago === 'TRANSFERENCIA').map((p) => p.cuenta))
  assert.ok(bancos.size >= 3, 'transferencias a 3 bancos')
  const vendedores = new Map()
  for (const v of VENTAS_DEMO) vendedores.set(v.vendedorId, (vendedores.get(v.vendedorId) || 0) + totalDeVenta(v))
  assert.ok(vendedores.size >= 5)
  assert.equal(Math.round(VENDEDORES_PESO.reduce((s, f) => s + f[1], 0) * 100), 100)
  assert.ok(new Set(vendedores.values()).size === vendedores.size, 'volúmenes distintos')
  const estados = new Set(historial.filter((v) => v.entrega === 'DELIVERY').map((v) => v.fulfillment))
  assert.ok(estados.size >= 3, `estados de entrega: ${[...estados]}`)
  assert.ok(VENTAS_DEMO.some((v) => /Encomienda/.test(v.observacion)), 'hay encomiendas')
  assert.ok(VENTAS_DEMO.some((v) => /Cambio|Devoluci/.test(v.observacion)), 'hay cambios/devoluciones')
  assert.ok(VENTAS_DEMO.some((v) => totalDeVenta(v) > totalPagado(v)), 'hay clientes con deuda')
  assert.ok(VENTAS_DEMO.some((v) => v.clienteId === 'demo-cliente-distribuidora-luque' && v.items.some((i) => i.cantidad >= 5)), 'mayorista por volumen')
})

test('#451 · catálogo de accesorios con foto, costo menor al precio, faltantes y stock bajo, sin stock negativo', () => {
  const categorias = new Set(ACCESORIOS_DEMO.map((a) => a[2]))
  for (const categoria of ['Protectores', 'Accesorios', 'Audio', 'Smartwatch', 'Power banks']) assert.ok(categorias.has(categoria), `falta ${categoria}`)
  const productos = conFotosDemo([], (id, nombre, categoria, precioVenta, precioCosto, stock) => ({ id, nombre, categoria, precioVenta, precioCosto, stock }))
  assert.equal(productos.length, ACCESORIOS_DEMO.length)
  assert.equal(new Set(productos.map((p) => p.id)).size, productos.length)
  for (const p of productos) {
    assert.ok(p.stock >= 0, `${p.id}: stock ≥ 0`)
    assert.ok(p.precioCosto > 0 && p.precioCosto < p.precioVenta, `${p.id}: costo < precio`)
    assert.ok(p.imagenes[0].startsWith('data:image/svg+xml'), `${p.id}: foto`)
  }
  assert.ok(productos.filter((p) => p.stock === 0).length >= 2, 'faltantes')
  assert.ok(productos.filter((p) => p.stock > 0 && p.reorderPoint && p.stock <= p.reorderPoint).length >= 3, 'stock bajo')
  for (const venta of VENTAS_DEMO) for (const item of venta.items) assert.ok(CATALOGO_VENTA[item.productoId], `${venta.id}: producto del catálogo`)
})
