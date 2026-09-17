import assert from 'node:assert/strict'
import { skuConSufijo } from '../lib/sku'
import { esNumeroCotizacionDuplicado } from '../lib/quote-number'

// El SKU es un dato comercial: tiene que ser legible y estable entre corridas,
// no llevar timestamp.
assert.equal(skuConSufijo('IPHONE-15-PRO-MAX', new Set()), 'IPHONE-15-PRO-MAX')
assert.equal(skuConSufijo('IPHONE-15-PRO-MAX', new Set(['IPHONE-15-PRO-MAX'])), 'IPHONE-15-PRO-MAX-2')
assert.equal(skuConSufijo('IPHONE-15-PRO-MAX', new Set(['IPHONE-15-PRO-MAX', 'IPHONE-15-PRO-MAX-2'])), 'IPHONE-15-PRO-MAX-3')
assert.equal(skuConSufijo('', new Set()), 'PRODUCTO')
assert.equal(skuConSufijo('X'.repeat(80), new Set()).length, 60)
assert.throws(() => skuConSufijo('CABLE', new Set(['CABLE', ...Array.from({ length: 998 }, (_, i) => `CABLE-${i + 2}`)])), /SKU único/)

// El reintento de la numeración de cotizaciones solo se dispara ante el
// choque del índice único sobre `number`.
assert.equal(esNumeroCotizacionDuplicado({ code: 'P2002', meta: { target: ['tenantId', 'number'] } }), true)
assert.equal(esNumeroCotizacionDuplicado({ code: 'P2002', meta: { target: ['tenantId', 'orderNumber'] } }), false)
assert.equal(esNumeroCotizacionDuplicado(new Error('otra cosa')), false)

console.log('sku.test.ts: ok')
