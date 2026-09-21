import assert from 'node:assert/strict'
import { analizarImportacion, condicionImportada, enteroImportado, decimalImportado } from '../lib/product-import'

// --- Primitivas de lectura ---------------------------------------------------
assert.equal(enteroImportado(1500000), 1500000)
assert.equal(enteroImportado('1.500.000'), 1500000)
assert.equal(enteroImportado('55.000'), 55000)
assert.equal(enteroImportado('55,000'), 55000)
assert.equal(enteroImportado(' 45000 '), 45000)
assert.equal(enteroImportado(''), null)
assert.equal(enteroImportado(null), null)
assert.equal(enteroImportado('abc'), undefined)
assert.equal(enteroImportado('-5'), undefined)
assert.equal(enteroImportado('1,5'), undefined)
assert.equal(enteroImportado(2147483648), undefined)
assert.equal(decimalImportado('12,34'), 12.34)
assert.equal(decimalImportado('12.345'), undefined)
assert.equal(decimalImportado('0,1'), 0.1)
assert.equal(condicionImportada('nuevo'), 'NEW')
assert.equal(condicionImportada('Semi'), 'USED')
assert.equal(condicionImportada('Reacondicionado'), 'REFURBISHED')
assert.equal(condicionImportada('usado'), 'USED')
assert.equal(condicionImportada('casi nuevo'), undefined)
assert.equal(condicionImportada(''), null)

const existentes = [
  { id: 'p1', sku: 'CABLE-USB', name: 'Cable USB', pricePyg: 45000, isActive: true },
  { id: 'p3', sku: 'SIN-PRECIO', name: 'Producto sin precio', pricePyg: 0, isActive: true },
  { id: 'p2', sku: 'VIEJO-1', name: 'Producto viejo', pricePyg: 1000, isActive: false },
]

// --- Alta: filas válidas, errores y duplicados -------------------------------
const alta = analizarImportacion([
  { sku: 'IPHONE-15', name: 'iPhone 15', pricePyg: '5.200.000', stock: '1', category: 'Celulares', condition: 'SEMI' },
  { sku: 'CABLE-USB', name: 'Cable USB', pricePyg: 45000, stock: 0, condition: 'NUEVO' },
  { sku: 'iphone-15', name: 'Repetido', pricePyg: 1000 },
  { sku: '', name: 'Sin SKU', pricePyg: 1000 },
  { sku: 'MAL-PRECIO', name: 'Precio malo', pricePyg: 'mil' },
  { sku: 'SIN-NOMBRE', pricePyg: 1000 },
  { sku: 'COND-RARA', name: 'Condición rara', pricePyg: 1000, condition: 'casi nuevo' },
], { existentes, mode: 'crear' })

assert.equal(alta.resumen.total, 7)
assert.equal(alta.resumen.crear, 1)
assert.equal(alta.resumen.errores, 6)
assert.equal(alta.rows[0].status, 'ok')
assert.equal(alta.rows[0].action, 'crear')
assert.equal(alta.rows[0].data.pricePyg, 5200000)
assert.equal(alta.rows[0].data.condition, 'USED')
assert.deepEqual([alta.rows[0].errors, alta.rows[0].warnings], [[], []])
assert.equal(alta.rows[1].line, 3)
assert.match(alta.rows[1].errors[0], /Ya existe/)
assert.match(alta.rows[2].errors[0], /repetido en el archivo \(fila 2\)/)
assert.match(alta.rows[3].errors[0], /Falta el SKU/)
assert.match(alta.rows[4].errors[0], /Precio inválido/)
assert.match(alta.rows[5].errors[0], /Falta el nombre/)
assert.match(alta.rows[6].errors[0], /Condición inválida/)

// --- SKU dado de baja: el índice único lo sigue ocupando ---------------------
const baja = analizarImportacion([{ sku: 'VIEJO-1', name: 'Otro', pricePyg: 5000 }], { existentes, mode: 'actualizar' })
assert.equal(baja.rows[0].status, 'error')
assert.match(baja.rows[0].errors[0], /producto eliminado/)

// --- Actualización de precios ------------------------------------------------
const upd = analizarImportacion([
  { sku: 'CABLE-USB', pricePyg: '55.000' },
  { sku: 'CABLE-USB', pricePyg: 60000 },
  { sku: 'NUEVO-1', name: 'Nuevo', pricePyg: 2000 },
  { sku: 'SIN-PRECIO' },
], { existentes, mode: 'actualizar' })
assert.equal(upd.resumen.actualizar, 1)
assert.equal(upd.resumen.crear, 1)
assert.equal(upd.resumen.omitir, 1)
assert.equal(upd.resumen.errores, 1)
assert.equal(upd.rows[0].action, 'actualizar')
assert.equal(upd.rows[0].data.pricePyg, 55000)
assert.match(upd.rows[0].warnings[0], /Actualiza el precio de "Cable USB"/)
assert.match(upd.rows[1].errors[0], /repetido en el archivo/)
assert.equal(upd.rows[3].action, 'omitir')
assert.match(upd.rows[3].warnings[0], /nada para actualizar/)

// --- Aviso de SKU parecido (no bloquea) --------------------------------------
const parecido = analizarImportacion([{ sku: 'cable-usb', name: 'Cable nuevo', pricePyg: 1000 }], { existentes, mode: 'crear' })
assert.equal(parecido.rows[0].status, 'warning')
assert.equal(parecido.rows[0].action, 'crear')
assert.match(parecido.rows[0].warnings[0], /SKU parecido: CABLE-USB/)

// --- Sin precio en un alta: se avisa y queda en 0 ----------------------------
const sinPrecio = analizarImportacion([{ sku: 'SIN-P', name: 'Sin precio' }], { existentes, mode: 'crear' })
assert.equal(sinPrecio.rows[0].action, 'crear')
assert.equal(sinPrecio.rows[0].data.pricePyg, null)
assert.match(sinPrecio.rows[0].warnings[0], /precio 0/)

// --- Stock en una actualización: se ignora con aviso -------------------------
const stockUpd = analizarImportacion([{ sku: 'CABLE-USB', pricePyg: 50000, stock: 99 }], { existentes, mode: 'actualizar' })
assert.equal(stockUpd.rows[0].action, 'actualizar')
assert.ok(stockUpd.rows[0].warnings.some(mensaje => /stock no se actualiza/.test(mensaje)))

console.log('product-import.test.ts: ok')
