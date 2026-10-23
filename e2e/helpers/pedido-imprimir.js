// «Imprimir» del detalle del pedido (estilo Shopify): el botón principal imprime con el
// último formato del usuario y el ▾ ofrece los demás. La vista previa del comprobante
// (niveles, formato, impresión directa) vive en «Vista previa y opciones…».
export async function abrirVistaPreviaComprobante(page) {
  await page.getByRole('button', { name: 'Elegir formato de impresión' }).click()
  await page.getByRole('menuitem', { name: 'Vista previa y opciones…' }).click()
}

// Imprime con un formato concreto desde el ▾ (pasa a ser el último de ese usuario).
export async function imprimirPedidoComo(page, formato) {
  await page.getByRole('button', { name: 'Elegir formato de impresión' }).click()
  await page.getByRole('menuitem', { name: formato }).click()
}
