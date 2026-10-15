// Logo de la empresa para el encabezado de TODOS los tickets térmicos (#426):
// se baja una vez por sesión, se convierte a bits para 80 y 58 mm y queda en
// `empresaImpresion`, de donde lo toma `encabezadoTicket`. Sin logo cargado o
// sin navegador (tests) los tickets salen sin imagen, como siempre.
import { getLogoDataUrl } from '@/lib/tenantLogo'
import { fijarLogoImpresion } from './empresaImpresion'
import { logoRasterDesdeDataUrl } from './logoRaster'

export async function cargarLogoImpresion() {
  try {
    const dataUrl = await getLogoDataUrl('light')
    if (!dataUrl) { fijarLogoImpresion({}); return }
    const [ochenta, cincuentaYOcho] = await Promise.all([
      logoRasterDesdeDataUrl(dataUrl, { anchoMax: 512 }),
      logoRasterDesdeDataUrl(dataUrl, { anchoMax: 320 }),
    ])
    fijarLogoImpresion({ 80: ochenta, 58: cincuentaYOcho })
  } catch (error) {
    console.error('[impresion] no se pudo preparar el logo del ticket:', error)
  }
}
