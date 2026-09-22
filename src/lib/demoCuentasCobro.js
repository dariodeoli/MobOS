// Cuentas de cobro ficticias de la demo (#190): muestran el sistema nuevo
// completo —efectivo, transferencias, tarjetas con procesadora, Pix, USDT y
// canje— con datos verosímiles. Los ids son internos (`demo-*`) y no se
// muestran; los campos visibles no llevan la palabra «demo» para que el sistema
// se vea como la tienda real. Empresa y titulares: `demo/empresa.js` (#213).
export const CUENTAS_DEMO = [
  { id: 'demo-cash-pyg', name: 'Caja · Guaraníes', kind: 'CASH', currency: 'PYG', reference: 'Caja chica mostrador' },
  { id: 'demo-cash-usd', name: 'Caja · Dólares', kind: 'CASH', currency: 'USD', reference: 'Caja chica dólares' },
  { id: 'demo-transfer-itau', name: 'Itaú · Cuenta corriente', kind: 'TRANSFER', currency: 'PYG', bank: 'Itaú', holder: 'Aurora Móviles', accountNumber: '001-2456789', document: '80012345-0', reference: 'Depósitos y transferencias' },
  { id: 'demo-transfer-continental', name: 'Continental · Cuenta corriente', kind: 'TRANSFER', currency: 'PYG', bank: 'Continental', holder: 'Aurora Móviles', accountNumber: '002-9876543', document: '80012345-0' },
  { id: 'demo-card-ueno', name: 'ueno · Tarjeta', kind: 'CARD', currency: 'PYG', bank: 'ueno', processor: 'UPay', holder: 'Aurora Móviles', feePercent: 3, settlementDays: 2 },
  { id: 'demo-card-dinelco', name: 'Dinelco · Tarjeta', kind: 'CARD', currency: 'PYG', processor: 'Dinelco', holder: 'Aurora Móviles', feePercent: 3, settlementDays: 1 },
  { id: 'demo-pix', name: 'Pix · Itaú', kind: 'PIX', currency: 'BRL', holder: 'Aurora Móviles', pixKey: 'cobros@auroramoviles.com.py' },
  { id: 'demo-crypto', name: 'USDT · Binance', kind: 'CRYPTO', currency: 'USD', holder: 'Aurora Móviles', reference: 'Tron TRC20 · TQ5x0000000000' },
  { id: 'demo-trade-in', name: 'Canje · Equipos', kind: 'TRADE_IN', currency: 'PYG', reference: 'Equipos recibidos como parte de pago' },
]

// Campos visibles del listado y los selectores: la prueba de #190 verifica que
// ninguno lleve la palabra «demo».
export const CAMPOS_VISIBLES_CUENTA = ['name', 'bank', 'holder', 'accountNumber', 'document', 'processor', 'pixKey', 'reference', 'currencyLabel']
