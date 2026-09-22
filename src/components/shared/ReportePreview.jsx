import { useEffect, useRef, useState } from 'react'
import { Button, Modal, Select, useToast } from '@/components/ui'
import { printHtml } from '@/utils/printHtml'
import { cargarImpresorasRemotas, configImpresora, estadoAgente, imprimirConDestino, impresoraPredeterminada, puedeCaerAlDialogo } from '@/lib/printing/agent'

// Reportes imprimibles (cierre de caja, resumen): misma vista previa y misma
// elección de formato que los comprobantes. La impresión directa manda el
// ESC/POS al agente con el ancho configurado; sin agente cae al diálogo del
// navegador con el HTML. `construir(format)` arma el HTML y `directo({ ancho })`
// el ticket térmico.
const ANCHO_VISTA = { 'thermal-80': 'max-w-[302px]', 'thermal-58': 'max-w-[219px]' }
export const FORMATOS_REPORTE = [['a4', 'A4'], ['thermal-80', '80 mm'], ['thermal-58', '58 mm']]
const anchoDeFormato = (formato) => (formato === 'thermal-80' ? 80 : formato === 'thermal-58' ? 58 : null)

export default function ReportePreview({ open, onClose, titulo = 'Reporte', formatoInicial = 'a4', construir, directo }) {
  const toast = useToast()
  const [formato, setFormato] = useState(formatoInicial)
  const [html, setHtml] = useState('')
  const [cargando, setCargando] = useState(false)
  const [agente, setAgente] = useState(false)
  const [hayImpresora, setHayImpresora] = useState(() => Boolean(impresoraPredeterminada()?.destino))
  const [enviando, setEnviando] = useState(false)
  // Los llamadores pasan funciones nuevas en cada render: se leen por ref para
  // que el efecto que arma el HTML no se dispare en bucle.
  const construirRef = useRef(construir)
  construirRef.current = construir
  const directoRef = useRef(directo)
  directoRef.current = directo

  useEffect(() => {
    let activo = true
    estadoAgente().then((info) => { if (activo) setAgente(Boolean(info?.disponible)) })
    cargarImpresorasRemotas().then((store) => { if (activo) setHayImpresora(Boolean(imprimirConDestino(store).predeterminada?.destino)) })
    return () => { activo = false }
  }, [])

  useEffect(() => {
    if (!open) return undefined
    let activo = true
    setCargando(true)
    Promise.resolve(construirRef.current?.(formato))
      .then((valor) => { if (activo) { setHtml(typeof valor === 'string' ? valor : ''); setCargando(false) } })
      .catch(() => { if (activo) { setHtml(''); setCargando(false) } })
    return () => { activo = false }
  }, [open, formato])

  function imprimir() {
    if (html) printHtml(html)
  }

  async function imprimirDirecto() {
    if (enviando || !directoRef.current) return
    setEnviando(true)
    try {
      const config = configImpresora()
      const resultado = await directoRef.current({ ancho: anchoDeFormato(formato) || config.ancho, formato })
      if (resultado?.ok) {
        if (resultado.encolado) toast.success('Reporte encolado', resultado.remoto ? 'Lo imprime el puente cuando lo reclame.' : 'La impresora no respondió; se reintenta solo.')
        else toast.success('Reporte enviado a la impresora', '')
        return
      }
      if (puedeCaerAlDialogo(resultado)) { imprimir(); return }
      toast.error('No se pudo imprimir', resultado?.error || 'Revisá la impresora.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={titulo} size="amplio">
      <div className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block space-y-1 text-xs text-mute">
            <span>Formato</span>
            <Select aria-label="Formato de impresión" className="w-32" value={formato} onChange={(event) => setFormato(event.target.value)}>
              {FORMATOS_REPORTE.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </Select>
          </label>
          <span className="flex flex-1 flex-wrap items-center justify-end gap-2">
            <Button type="button" variant="outline" onClick={imprimir} disabled={!html || cargando}>Descargar PDF</Button>
            {(agente || hayImpresora) && <Button type="button" variant="outline" onClick={imprimirDirecto} disabled={cargando || enviando}>{enviando ? 'Enviando…' : 'Impresión directa'}</Button>}
            <Button type="button" onClick={imprimir} disabled={!html || cargando}>{cargando ? 'Preparando…' : 'Imprimir'}</Button>
          </span>
        </div>
        <p className="text-[11px] text-mute">Para PDF, elegí «Guardar como PDF» en el diálogo de impresión.</p>
        <iframe
          title={`Vista previa · ${titulo}`}
          srcDoc={html}
          className={`h-[60vh] w-full rounded-xl border border-ink-600 bg-white ${ANCHO_VISTA[formato] ? 'mx-auto ' + ANCHO_VISTA[formato] : ''}`}
        />
      </div>
    </Modal>
  )
}
