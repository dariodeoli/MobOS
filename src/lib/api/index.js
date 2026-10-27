import { api, request, apiFetch, API_URL } from './client'
import { isDemoRuntime } from '@/lib/demoMode'
import { getProductos } from '@/lib/storage'
import { cancelarVerificacionDemo, crearVerificacionDemo, detalleVerificacionDemo, escanearVerificacionDemo, listVerificacionesDemo, terminarVerificacionDemo } from '@/lib/demoVerificacion.js'
import { createDemoTransfer, createDemoTransitAssignment, createDemoUnit, listDemoSharedGrants, searchDemoTenants, setDemoSharedGrant, updateDemoTransfer, updateDemoTransitAssignment, demoStockAlerts, filtrarUnidadesDemo, listDemoBranches, listDemoLocations, listDemoReservations, listDemoTransfers, listDemoUnits, releaseDemoReservations, reserveDemoUnits, saveDemoBranch, saveDemoLocation, updateDemoUnit, verifyDemoUnit, undoVerifyDemoUnit } from '@/lib/demoInventory'
import { listarStockItemsDemo } from '@/lib/demo/stockItems.js'
import { createDemoPriceList, deactivateDemoPriceList, listDemoPriceLists, pricingDemo, updateDemoPriceList } from '@/lib/demo/precios.js'
import { createDemoSupplyNeed, createDemoSupplyPurchase, createDemoSupplyReception, demoSupplyAlerts, demoSupplyPerformance, demoSupplyPurchaseLabels, demoSupplyReceptionDetail, demoSupplySerial, demoSupplyShipmentManifest, listDemoSupplyNeeds, listDemoSupplyPurchases, listDemoSupplyReceptions, listDemoSupplyShipments, updateDemoSupplyNeeds, updateDemoSupplyPurchase, updateDemoSupplyReception, updateDemoSupplyShipment } from '@/lib/demo/abastecimiento.js'
import { actualizarCompraSinStockDemo, avisarClienteDemo, comprarSinStockDemo, esCompraDemoSinStock, esNecesidadDemoSinStock, listarVentasSinStockDemo, recibirRapidoSinStockDemo } from '@/lib/demo/ventaSinStock.js'
import { completeDemoArrivalSerial, confirmDemoArrival, createDemoArrival, getDemoArrival, listDemoArrivals, parseDemoArrival, patchDemoArrivalLine } from '@/lib/demo/llegada.js'
import { EQUIPO_DEMO } from '@/lib/demo/iphones.js'
import { actualizarComboDemo, crearComboDemo, listarCombosDemo } from '@/lib/demo/combos.js'
import { liberarDemo, renovarDemo, retenerDemo } from '@/lib/demo/retenciones.js'
import { anularGiftCardDemo, buscarGiftCardDemo, detalleGiftCardDemo, emitirGiftCardDemo, listarGiftCardsDemo } from '@/lib/giftCards'
// El módulo de Inventario funciona igual en demo (#213): cuando hay sesión demo
// los recursos leen el store session-only; con cuenta real van al API.
const demo = (real, local) => (...args) => Promise.resolve(isDemoRuntime ? local(...args) : real(...args))
export { api, request, apiFetch, API_URL }
export { ApiError, isApiError } from './errors'
export { clearAccessToken, clearCompanyToken, clearSession, getAccessToken, getCompanyContext, getCompanyToken, setAccessToken, setCompanyToken, sessionApi } from './session'

export const resources = {
  customers: { list: (q = '') => api.get(`/api/customers?q=${encodeURIComponent(q)}`), create: data => api.post('/api/customers', data), update: (id, data) => api.patch(`/api/customers/${encodeURIComponent(id)}`, data), duplicates: (params = {}) => api.get(`/api/customers/duplicates?${new URLSearchParams(Object.entries(params).filter(([, valor]) => valor))}`), mergePreview: (id, withId) => api.get(`/api/customers/${encodeURIComponent(id)}/merge?with=${encodeURIComponent(withId)}`), merge: (id, data) => api.post(`/api/customers/${encodeURIComponent(id)}/merge`, data) },
  products: { page: ({ q = '', page = 1, pageSize = 16, accessoryCategory = '' } = {}, options = {}) => api.get(`/api/products?${new URLSearchParams({ page: String(page), pageSize: String(pageSize), ...(q ? { q } : {}), ...(accessoryCategory ? { accessoryCategory } : {}) })}`, { cacheMs: 0, ...options }), list: demo((q = '') => api.get(`/api/products?q=${encodeURIComponent(q)}`), (q = '') => getProductos().filter((producto) => !q || String(producto.nombre || producto.name || '').toLowerCase().includes(String(q).toLowerCase()))), create: data => api.post('/api/products', data) },
  stock: { list: demo(() => api.get('/api/stock'), () => demoStockAlerts(getProductos())), adjust: demo(data => api.patch('/api/stock', data), () => ({})) },
  // U3: lista unificada de Stock (unidades + accesorios) con cursor. En demo se arma
  // la misma respuesta desde el inventario session-only.
  stockItems: { list: demo((params) => api.get(`/api/stock/items?${params}`), (params) => listarStockItemsDemo(params, { units: listDemoUnits('', 'active'), removed: listDemoUnits('', 'removed'), products: getProductos(), branches: listDemoBranches() })) },
  inventoryBranches: { list: demo(() => api.get('/api/inventory-branches'), () => listDemoBranches()) },
  // Configuración → Sucursales: en demo, alta/edición/activación en memoria de la pestaña.
  branches: { list: demo(() => api.get('/api/branches'), () => listDemoBranches()), create: demo(data => api.post('/api/branches', data), data => saveDemoBranch(data)), update: demo(data => api.patch('/api/branches', data), data => saveDemoBranch(data)) },
  inventoryUnits: { list: demo((q = '', view = 'active', opciones = {}) => api.get(`/api/inventory-units?${new URLSearchParams({ ...(q ? { q } : {}), ...(view !== 'active' ? { view } : {}), ...(opciones.productId ? { productId: opciones.productId } : {}), ...(opciones.branchId ? { branchId: opciones.branchId } : {}), ...(opciones.status ? { status: opciones.status } : {}) })}`), (q = '', view = 'active', opciones = {}) => filtrarUnidadesDemo(listDemoUnits(q, view), opciones)), create: demo(data => api.post('/api/inventory-units', data), data => createDemoUnit(data)), update: demo(data => api.patch('/api/inventory-units', data), data => updateDemoUnit(data)), verify: demo(data => api.post('/api/inventory-units/verify', data), data => verifyDemoUnit(data)), undoVerify: demo(data => api.delete('/api/inventory-units/verify', { body: data }), data => undoVerifyDemoUnit(data)) },
  stockVerifications: { list: demo(branchId => api.get(`/api/stock-verifications${branchId ? `?branchId=${encodeURIComponent(branchId)}` : ''}`), () => listVerificacionesDemo()), create: demo(data => api.post('/api/stock-verifications', data), data => crearVerificacionDemo(data)), get: demo(id => api.get(`/api/stock-verifications/${encodeURIComponent(id)}`), id => detalleVerificacionDemo(id)), scan: demo((id, serial) => api.patch(`/api/stock-verifications/${encodeURIComponent(id)}`, { action: 'scan', serial }), (id, serial, usuario) => escanearVerificacionDemo(id, serial, usuario)), finish: demo(id => api.patch(`/api/stock-verifications/${encodeURIComponent(id)}`, { action: 'finish' }), id => terminarVerificacionDemo(id)), cancel: demo(id => api.patch(`/api/stock-verifications/${encodeURIComponent(id)}`, { action: 'cancel' }), id => cancelarVerificacionDemo(id)) },
  // Retención de IMEI del carrito (apartado corto con latido). En la demo es simulada.
  inventoryHolds: {
    hold: demo(data => api.post('/api/inventory-reservations/holds', data), data => retenerDemo(data)),
    renew: demo(data => api.patch('/api/inventory-reservations/holds', { action: 'renew', ...data }), data => renovarDemo(data)),
    release: demo(data => api.patch('/api/inventory-reservations/holds', { action: 'release', ...data }), data => liberarDemo(data)),
  },
  inventoryReservations: { list: demo(() => api.get('/api/inventory-reservations'), () => listDemoReservations()), create: demo(data => api.post('/api/inventory-reservations', data), data => reserveDemoUnits(data)), release: demo(serials => api.patch('/api/inventory-reservations', { action: 'release', serials }), serials => releaseDemoReservations(serials)) },
  stockLocations: { list: demo((branchId = '') => api.get(`/api/stock-locations${branchId ? `?branchId=${encodeURIComponent(branchId)}` : ''}`), (branchId = '') => listDemoLocations(branchId)), create: demo(data => api.post('/api/stock-locations', data), data => saveDemoLocation(data)), update: demo(data => api.patch('/api/stock-locations', data), data => saveDemoLocation(data)) },
  sharedStock: { list: demo(() => api.get('/api/shared-stock'), () => []), mine: demo(() => api.get('/api/shared-stock?mine=true'), () => listDemoSharedGrants()), setGrant: demo(data => api.post('/api/shared-stock', data), data => setDemoSharedGrant(data)) },
  tenants: { search: demo((q = '') => api.get(`/api/tenants?q=${encodeURIComponent(q)}`), (q = '') => searchDemoTenants(q)) },
  transfers: { list: demo(() => api.get('/api/transfers'), () => listDemoTransfers()), create: demo(data => api.post('/api/transfers', data), data => createDemoTransfer(data)), update: demo(data => api.patch('/api/transfers', data), data => updateDemoTransfer(data)), accessToken: demo((id, regenerate = false) => api.post(`/api/transfers/${encodeURIComponent(id)}/access-token`, { regenerate }), () => ({ publicToken: 'demo-remito' })) },
  combos: { list: demo((all = false) => api.get('/api/combos' + (all ? '?all=1' : '')), (all = false) => listarCombosDemo(all)), create: demo(data => api.post('/api/combos', data), data => crearComboDemo(data)), update: demo(data => api.patch('/api/combos', data), data => actualizarComboDemo(data)) },
  priceLists: {
    list: demo(() => api.get('/api/price-lists'), () => listDemoPriceLists()),
    create: demo(data => api.post('/api/price-lists', data), data => createDemoPriceList(data)),
    update: demo((id, data) => api.patch(`/api/price-lists/${encodeURIComponent(id)}`, data), (id, data) => updateDemoPriceList(id, data)),
    deactivate: demo(id => api.delete(`/api/price-lists/${encodeURIComponent(id)}`), id => deactivateDemoPriceList(id)),
    pricing: demo(params => api.get(`/api/pricing?${new URLSearchParams(params)}`), params => pricingDemo(params, getProductos())),
  },
  quotes: { list: (status = '') => api.get(`/api/quotes${status ? `?status=${status}` : ''}`), create: data => api.post('/api/quotes', data), update: data => api.patch('/api/quotes', data), convert: id => api.post(`/api/quotes/${encodeURIComponent(id)}/convert`, {}), accessToken: (id, regenerate = false) => api.post(`/api/quotes/${encodeURIComponent(id)}/access-token`, { regenerate }), sendEmail: (id, data = {}) => api.post(`/api/quotes/${encodeURIComponent(id)}/email`, data), mensaje: id => api.get(`/api/quotes/${encodeURIComponent(id)}/message`), enviarMensaje: (id, canal) => api.post(`/api/quotes/${encodeURIComponent(id)}/message`, { canal }) },
  orders: { list: () => api.get('/api/orders'), create: data => api.post('/api/orders', data), get: id => api.get(`/api/orders/${encodeURIComponent(id)}`), updateDelivery: (id, data) => api.patch(`/api/orders/${encodeURIComponent(id)}`, data) },
  payments: { create: data => api.post('/api/payments', data) },
  // Gift cards (#280): emisión con código, consulta de saldo, historial y
  // anulación. En la demo viven en memoria de la pestaña con la misma forma.
  giftCards: {
    list: demo(() => api.get('/api/gift-cards'), () => listarGiftCardsDemo()),
    lookup: demo(code => api.get(`/api/gift-cards/lookup?code=${encodeURIComponent(code)}`), code => buscarGiftCardDemo(code)),
    issue: demo(data => api.post('/api/gift-cards', data), data => emitirGiftCardDemo(data)),
    get: demo(id => api.get(`/api/gift-cards/${encodeURIComponent(id)}`), id => detalleGiftCardDemo(id)),
    cancel: demo(id => api.patch(`/api/gift-cards/${encodeURIComponent(id)}`, { action: 'cancel' }), id => anularGiftCardDemo(id)),
  },
  users: { list: demo(() => api.get('/api/users'), () => EQUIPO_DEMO.map((persona) => ({ id: persona.id, name: persona.nombre, email: persona.email, role: persona.rol, status: persona.activo ? 'ACTIVE' : 'INACTIVE' }))), create: data => api.post('/api/users', data) },
  // Abastecimiento F1 (#250/#254): necesidades consolidadas de compra.
  supplyNeeds: {
    // El panel tiene botón «Actualizar»: se pide sin caché de GET para que el
    // refresco traiga el estado real de las necesidades.
    list: demo((params = {}) => {
      const query = new URLSearchParams(Object.entries(params).filter(([, valor]) => valor !== '' && valor != null).map(([clave, valor]) => [clave, String(valor)]))
      return api.get(`/api/supply/needs${query.toString() ? `?${query}` : ''}`, { cacheMs: 0 })
    }, (params = {}) => (params.detalle ? listarVentasSinStockDemo(params) : listDemoSupplyNeeds(params))),
    create: demo(data => api.post('/api/supply/needs', data), data => createDemoSupplyNeed(data)),
    update: demo(data => api.patch('/api/supply/needs', data), data => (data?.action === 'notified' ? avisarClienteDemo(data) : updateDemoSupplyNeeds(data))),
  },
  // F3 (#250 §7): preparación de la compra (IMEI por completar) — escaneo de a
  // uno (`scan`) o pegado múltiple (`serials`).
  supplyPurchases: {
    list: demo((params = {}) => {
      const query = new URLSearchParams(Object.entries(params).filter(([, valor]) => valor !== '' && valor != null).map(([clave, valor]) => [clave, String(valor)]))
      return api.get(`/api/supply/purchases${query.toString() ? `?${query}` : ''}`, { cacheMs: 0 })
    }, (params = {}) => listDemoSupplyPurchases(params)),
    // #250 F2: compra desde el panel (cubre necesidades o reposición libre).
    create: demo(data => api.post('/api/supply/purchases', data), data => ((data?.lines || []).some(linea => esNecesidadDemoSinStock(linea?.needId)) ? comprarSinStockDemo(data) : createDemoSupplyPurchase(data))),
    update: demo(data => api.patch('/api/supply/purchases', data), data => (esCompraDemoSinStock(data?.id) ? actualizarCompraSinStockDemo(data) : updateDemoSupplyPurchase(data))),
    // F3 (#250 §11): etiquetas de la preparación (una por unidad comprada).
    labels: demo(id => api.get(`/api/supply/purchases/${encodeURIComponent(id)}/labels`, { cacheMs: 0 }), id => demoSupplyPurchaseLabels(id)),
  },
  // F3/F4 (#250): lotes (despachos) y su IMEI diferido — se completa antes de
  // despachar o en tránsito, de a uno (`scan`) o pegado (`serials`). El
  // manifiesto (§11) se imprime desde el lote y se reimprime al recibirlo.
  // Ojo: una sola clave `supplyShipments` — bloques repetidos se pisaban entre
  // sí y dejaban `manifest` sin definir (el botón «Manifiesto» fallaba).
  supplyShipments: {
    list: demo((params = {}) => {
      const query = new URLSearchParams(Object.entries(params).filter(([, valor]) => valor !== '' && valor != null).map(([clave, valor]) => [clave, String(valor)]))
      return api.get(`/api/supply/shipments${query.toString() ? `?${query}` : ''}`, { cacheMs: 0 })
    }, (params = {}) => listDemoSupplyShipments(params)),
    create: demo(data => api.post('/api/supply/shipments', data), () => ({})),
    update: demo(data => api.patch('/api/supply/shipments', data), data => updateDemoSupplyShipment(data)),
    manifest: demo(id => api.get(`/api/supply/shipments/${encodeURIComponent(id)}/manifest`, { cacheMs: 0 }), id => demoSupplyShipmentManifest(id)),
  },
  // F5 (#250 §11): llegadas pendientes y recepción contra el manifiesto.
  supplyReceptions: {
    list: demo((params = {}) => {
      const query = new URLSearchParams(Object.entries(params).filter(([, valor]) => valor !== '' && valor != null).map(([clave, valor]) => [clave, String(valor)]))
      return api.get(`/api/supply/receptions${query.toString() ? `?${query}` : ''}`, { cacheMs: 0 })
    }, (params = {}) => (params.id || params.shipmentId ? demoSupplyReceptionDetail(params) : listDemoSupplyReceptions(params))),
    create: demo(data => api.post('/api/supply/receptions', data), data => (data?.action === 'receiveQuick' ? recibirRapidoSinStockDemo(data) : createDemoSupplyReception(data))),
    update: demo(data => api.patch('/api/supply/receptions', data), data => updateDemoSupplyReception(data)),
  },
  // Llegada de mercadería (#408 G): borrador → pegado en seco → editar filas →
  // confirmar (idempotente) → completar IMEI faltante. En demo, intérprete local.
  supplyArrivals: {
    list: demo((params = {}) => api.get(`/api/supply/arrivals?${new URLSearchParams(params)}`, { cacheMs: 0 }), () => listDemoArrivals()),
    create: demo(data => api.post('/api/supply/arrivals', data), data => createDemoArrival(data)),
    get: demo(id => api.get(`/api/supply/arrivals/${encodeURIComponent(id)}`, { cacheMs: 0 }), id => getDemoArrival(id, getProductos())),
    parse: demo((id, text) => api.post(`/api/supply/arrivals/${encodeURIComponent(id)}/parse`, { text }), (id, text) => parseDemoArrival(id, text, getProductos())),
    patchLine: demo((id, data) => api.patch(`/api/supply/arrivals/${encodeURIComponent(id)}/lines`, data), (id, data) => patchDemoArrivalLine(id, data, getProductos())),
    // `confirmar` y no `confirm`: la regla de diseño prohíbe llamadas con ese nombre (diálogo nativo).
    confirmar: demo((id, key) => api.post(`/api/supply/arrivals/${encodeURIComponent(id)}/confirm`, {}, { headers: { 'Idempotency-Key': key } }), id => confirmDemoArrival(id, getProductos())),
    completeSerial: demo((lineId, serial, confirmSerial = false) => api.patch(`/api/supply/arrivals/lines/${encodeURIComponent(lineId)}`, { serial, ...(confirmSerial ? { confirmSerial: true } : {}) }), (lineId, serial, confirmSerial) => completeDemoArrivalSerial(lineId, serial, confirmSerial, getProductos())),
  },
  // F6 (#250): rendimiento por proveedor, tiempos de tránsito y atrasos. El
  // panel tiene «Actualizar»: se piden sin caché de GET, como el resto.
  supplyPerformance: {
    get: demo((params = {}) => {
      const query = new URLSearchParams(Object.entries(params).filter(([, valor]) => valor !== '' && valor != null).map(([clave, valor]) => [clave, String(valor)]))
      return api.get(`/api/supply/performance${query.toString() ? `?${query}` : ''}`, { cacheMs: 0 })
    }, (params = {}) => demoSupplyPerformance(params)),
  },
  supplyAlerts: {
    get: demo((params = {}) => {
      const query = new URLSearchParams(Object.entries(params).filter(([, valor]) => valor !== '' && valor != null).map(([clave, valor]) => [clave, String(valor)]))
      return api.get(`/api/supply/alerts${query.toString() ? `?${query}` : ''}`, { cacheMs: 0 })
    }, () => demoSupplyAlerts()),
  },
  // F4 (#250): historial de una unidad en la cadena de abastecimiento
  // (necesidad → compra → lote → stock), para la ficha del inventario (#278).
  supplySerials: {
    get: demo((serial) => api.get(`/api/supply/serials/${encodeURIComponent(serial)}`, { cacheMs: 0 }), serial => demoSupplySerial(serial)),
  },
  // #279 (A4): asignaciones futuras de unidades en tránsito (apartar para una
  // venta, liberar y consultar).
  transitAssignments: {
    list: (params = {}) => {
      const query = new URLSearchParams(Object.entries(params).filter(([, valor]) => valor !== '' && valor != null).map(([clave, valor]) => [clave, String(valor)]))
      return api.get(`/api/transit-assignments${query.toString() ? `?${query.toString()}` : ''}`, { cacheMs: 0 })
    },
    create: demo(data => api.post('/api/transit-assignments', data), data => createDemoTransitAssignment(data)),
    update: demo(data => api.patch('/api/transit-assignments', data), data => updateDemoTransitAssignment(data)),
  },
  audit: { list: (params = {}) => api.get(`/api/audit?${new URLSearchParams(params)}`) },
  sessions: { list: () => api.get('/api/sessions'), revoke: sessionId => api.delete('/api/sessions', { body: { sessionId } }) },
}

export { presenciaApi } from './presence'
