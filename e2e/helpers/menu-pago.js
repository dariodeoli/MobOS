// Una fila de pago del POS tiene un único ⋯ con sus acciones: cambiar cuenta,
// ver/copiar los datos para el cliente y eliminar. Estos helpers lo abren.
export const botonMenuPago = (contenedor, n = 1) => contenedor.getByRole('button', { name: `Más acciones del pago ${n}`, exact: true })

export async function abrirMenuPago(contenedor, n = 1) {
  await botonMenuPago(contenedor, n).click()
}

export async function verDatosCliente(page, contenedor, n = 1) {
  await abrirMenuPago(contenedor, n)
  await page.getByTestId('cuenta-ver-datos').click()
}

export async function cambiarCuentaDelPago(page, contenedor, n = 1) {
  await abrirMenuPago(contenedor, n)
  await page.getByTestId('cuenta-cambiar').click()
}

export async function eliminarPago(page, contenedor, n = 1) {
  await abrirMenuPago(contenedor, n)
  await page.getByRole('menuitem', { name: `Eliminar pago ${n}`, exact: true }).click()
}
