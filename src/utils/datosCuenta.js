// Datos de una cuenta de cobro para pasarle al cliente (tarjeta del POS): las
// filas que se muestran en «Ver datos para el cliente» y el bloque de texto
// limpio de «Copiar datos». Sin React para poder testearlo.

export const ALIAS_TIPOS = { RUC: 'RUC', EMAIL: 'Correo', PHONE: 'Teléfono', OTHER: 'Otro' }

const numero = (valor) => String(valor ?? '').replace(/\s+/g, '')

/** «Alias (Correo)» según el tipo cargado; «Alias» si no tiene tipo. */
export function etiquetaAlias(account) {
  const tipo = ALIAS_TIPOS[account?.aliasType]
  return tipo ? `Alias (${tipo})` : 'Alias'
}

// Orden: número, titular y banco/procesadora; alias, llave, referencia y CI/RUC
// completan cuando aplican.
export function filasDeCuenta(account) {
  const filas = []
  if (account.accountNumber) filas.push(['Nro de cuenta', numero(account.accountNumber)])
  if (account.holder) filas.push(['Titular', account.holder])
  if (account.kind === 'CARD' && account.processor) filas.push(['Procesadora', account.processor])
  else if (account.bank) filas.push(['Banco', account.bank])
  if (account.aliasValue) filas.push([etiquetaAlias(account), account.aliasValue])
  if (account.pixKey) filas.push(['Llave Pix', account.pixKey])
  if (account.reference) filas.push(['Referencia', account.reference])
  if (account.kind === 'TRANSFER' && account.document) filas.push(['CI/RUC', account.document])
  return filas
}

const ORDEN_COPIA = ['Titular', 'Banco', 'Procesadora', 'Nro de cuenta', 'CI/RUC']
const lugar = (etiqueta) => {
  const i = ORDEN_COPIA.indexOf(etiqueta)
  return i >= 0 ? i : etiqueta.startsWith('Alias') ? ORDEN_COPIA.length : ORDEN_COPIA.length + 1
}

/** Texto listo para pegar en un chat: una línea «Etiqueta: valor» por dato. */
export function textoDatosCuenta(account) {
  if (!account) return ''
  return filasDeCuenta(account)
    .sort((a, b) => lugar(a[0]) - lugar(b[0]))
    .map(([etiqueta, valor]) => `${etiqueta}: ${valor}`)
    .join('\n')
}
