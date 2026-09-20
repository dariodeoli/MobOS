// Shared seed constants for the E2E harness (Phase 1 QA).
// global-setup.mjs creates this tenant/data; specs assert against it.

export const SEED = {
  api: process.env.MOBOS_E2E_API_URL || `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`,
  company: {
    name: 'Tienda E2E',
    email: 'e2e-tienda@test.local',
    password: 'E2e-password-123',
    deviceId: 'e2e-setup-device',
  },
  admin: { name: 'Administrador', pin: '1234' },
  sellers: [
    { name: 'Vendedor E2E Uno', email: 'vendedor-uno@test.local', pin: '2468' },
    { name: 'Vendedor E2E Dos', email: 'vendedor-dos@test.local', pin: '2469' },
  ],
  // Reparto propio: usuario con rol REPARTIDOR y un pedido sin cobrar que se
  // resetea en cada corrida (ver ensureDeliveryOrder en global-setup).
  repartidor: { name: 'Repartidor E2E', email: 'repartidor-e2e@test.local', pin: '3579' },
  deliveryOrderNumber: 'E2E-DELIVERY-001',
  deliveryCustomer: { name: 'Cliente E2E Delivery', phone: '981555111' },
  branchId: 'e2e-branch-1',
  branchName: 'Sucursal E2E',
  products: {
    cable: { sku: 'E2E-CABLE', name: 'Cable USB-C E2E', category: 'Accesorios', pricePyg: 45000, stock: 25, costPyg: 20000 },
    funda: { sku: 'E2E-FUNDA', name: 'Funda E2E Silicone', category: 'Accesorios', pricePyg: 80000, stock: 15, costPyg: 35000 },
    auris: { sku: 'E2E-AURIS', name: 'Auricular E2E Pro', category: 'Audio', pricePyg: 250000, stock: 10, costPyg: 150000 },
    speaker: { sku: 'E2E-SPEAKER', name: 'Parlante E2E Mini', category: 'Audio', pricePyg: 320000, stock: 6, costPyg: 190000 },
    // Serialized unit: POST with imei + branchId creates the product AND its
    // InventoryUnit in one transaction (backend/app/api/products/route.ts).
    iphone: { sku: 'E2E-IPHONE15', name: 'iPhone 15 E2E Serial', category: 'Celulares', pricePyg: 5200000, stock: 1, costPyg: 3800000, imei: '356789102345678' },
  },
  seedOrderNumber: 'E2E-SEED-001',
  checkoutCustomer: 'Cliente E2E Checkout',
  // Checkout uses the account-based payment flow (the legacy flow is broken
  // against the backend; see the BUG note in pos-checkout.spec.js).
  accounts: [
    { name: 'Caja E2E', currency: 'PYG', kind: 'CASH', isActive: true, feePercent: 0 },
    { name: 'Transferencia E2E', currency: 'PYG', kind: 'TRANSFER', bank: 'Banco E2E', holder: 'Tienda E2E', accountNumber: 'E2E-0001', isActive: true, feePercent: 0 },
  ],
}
