import assert from 'node:assert/strict'
import { readDemoPromotions, saveDemoPromotion, quoteDemoPromotion, validateDemoPromotionItems, recordDemoPromotionUsage, toggleDemoPromotion } from './demoPromotions.js'
const memory = new Map()
globalThis.localStorage = { getItem:k=>memory.get(k)??null, setItem:(k,v)=>memory.set(k,v) }
const products=[{id:'p',precioVenta:1000}]
assert.equal(quoteDemoPromotion(products[0],1,'demo10').unitPricePyg,900)
saveDemoPromotion({...readDemoPromotions()[0],code:'LIMIT',maxUnits:2})
const item={productId:'p',quantity:1,unitPricePyg:900,couponCode:'LIMIT'}
assert.deepEqual(validateDemoPromotionItems([item],products),{LIMIT:1})
assert.throws(()=>validateDemoPromotionItems([{...item,unitPricePyg:1}],products))
assert.throws(()=>validateDemoPromotionItems([item],products,1))
assert.throws(()=>validateDemoPromotionItems([item,item,item],products))
recordDemoPromotionUsage([item,item],products)
assert.throws(()=>validateDemoPromotionItems([item],products))
toggleDemoPromotion('demo-ten',false)
assert.throws(()=>quoteDemoPromotion(products[0],1,'DEMO10'))
console.log('Demo promotions: quote, tamper, stacking, duplicate lines, limits and deactivation OK.')
