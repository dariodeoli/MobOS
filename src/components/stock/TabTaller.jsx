import TallerRack from '@/components/inventory/TallerRack'
import { printHtml } from '@/utils/printHtml'
import { getLogoDataUrl } from '@/lib/tenantLogo'
import { buildStationSheetHtml, buildStationSheetsHtml } from '@/lib/printing/hojaEstacion'
import { datosCertificado } from '@/lib/printing/certificado'
import { buildCertificadosHtml } from '@/components/shared/OrderReceipt'
import { IMPRESION_DEMO, printLabel, printLabels } from './impresionStock'

export default function TabTaller({ ctx }) {
  const { disponibles, locations, busy, verify, verificarLote, avisarImpresion, esDemo } = ctx
  return (
    <div className="mt-4">
        <TallerRack
          unidades={disponibles}
          ubicaciones={locations}
          busy={busy}
          onVerificar={(unit) => verify(unit)}
          onVerificarLote={verificarLote}
          onEtiqueta={(unit) => printLabel(unit).then(avisarImpresion)}
          onEtiquetasLote={(lista) => printLabels(lista)}
          onHoja={(lista, titulo) => (esDemo ? IMPRESION_DEMO : getLogoDataUrl().then((logo) => printHtml(buildStationSheetHtml(lista, { estacion: titulo, logo }))))}
          onHojasPorEstacion={(grupos) => (esDemo ? IMPRESION_DEMO : getLogoDataUrl().then((logo) => printHtml(buildStationSheetsHtml(grupos, { logo }))))}
          onCertificados={(lista) => {
            if (esDemo) return IMPRESION_DEMO
            const certificados = lista.map(unit => datosCertificado(unit))
            return buildCertificadosHtml(certificados, { format: 'a4' }).then(html => printHtml(html))
          }}
        />
      </div>
  )
}
