import { error, json } from '../../../../lib/http'
import { requireSession } from '../../../../lib/auth'
import { aexLabel, aexLabelFormatValido, aexWebTrackingUrl } from '../../../../lib/aex'

// Etiqueta o guía AEX en PDF para un traslado ya despachado. La descarga la
// hace el servidor (la clave privada nunca llega al navegador) y se responde
// con el archivo directo. Sin credenciales se avisa `unconfigured` para que la
// interfaz abra el sitio de AEX.
export async function GET(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  const params = new URL(request.url).searchParams
  const guia = (params.get('guia') || '').trim().slice(0, 100)
  const formato = params.get('formato') || 'etiqueta8x6'
  if (!guia) return error('Indicá el número de guía.')
  if (!aexLabelFormatValido(formato)) return error('Formato de impresión inválido.')
  const resultado = await aexLabel(guia, formato, params.get('partida') === '1')
  if (!resultado.ok) {
    if (resultado.motivo === 'unconfigured') return json({ unconfigured: true, webUrl: aexWebTrackingUrl(guia) })
    return error('AEX no pudo generar la etiqueta. Verificá la guía o reintentá en unos segundos.', 502)
  }
  return new Response(resultado.pdf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="aex-${guia.replace(/[^A-Za-z0-9._-]/g, '')}.pdf"`,
      'Cache-Control': 'no-store',
    },
  })
}
