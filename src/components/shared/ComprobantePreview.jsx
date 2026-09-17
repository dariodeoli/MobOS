import { useEffect, useState } from 'react'
import { Button, Modal, Select, useToast } from '@/components/ui'
import {
  FORMATOS_COMPROBANTE,
  NIVELES_COMPROBANTE,
  buildOrderReceiptHtml,
  formatoPreferido,
  nivelPreferido,
  recordarPreferencia,
  tokenDeNivel,
  accessUrlFor,
  trackingUrlFor,
} from './OrderReceipt'
import { printHtml } from '@/utils/printHtml'
import { configImpresora, estadoAgente, imprimirTicketDirecto } from '@/lib/printing/agent'
import { ticketComprobante } from '@/lib/printing/tickets'

// Vista previa real del comprobante: nivel (Rápido/Completo/Detallado) y
// formato (A4/58 mm) se eligen acá y la última combinación queda recordada.
export default function ComprobantePreview({ order, open, onClose }) {
  const toast = useToast()
  const [nivel, setNivel] = useState(nivelPreferido)
  const [formato, setFormato] = useState(formatoPreferido)
  const [html, setHtml] = useState('')
  const [link, setLink] = useState('')
  const [cargando, setCargando] = useState(false)
  const [agente, setAgente] = useState(false)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    let activo = true
    estadoAgente().then((estado) => { if (activo) setAgente(Boolean(estado.disponible)) })
    return () => { activo = false }
  }, [])

  useEffect(() => {
    if (!open || !order) return undefined
    let active = true
    setCargando(true)
    ;(async () => {
      const token = await tokenDeNivel(order.id, nivel)
      const built = await buildOrderReceiptHtml(order, { level: nivel, format: formato, token })
      if (active) { setHtml(built); setLink(token ? accessUrlFor(token) : trackingUrlFor(order)); setCargando(false) }
    })()
    return () => { active = false }
  }, [open, order, nivel, formato])

  function imprimir() {
    if (!html) return
    recordarPreferencia(nivel, formato)
    printHtml(html)
  }

  async function imprimirDirecto() {
    if (enviando) return
    setEnviando(true)
    const { ancho } = configImpresora()
    const resultado = await imprimirTicketDirecto(ticketComprobante(order, { nivel, ancho, link }))
    setEnviando(false)
    if (!resultado.ok) { toast.error('No se pudo imprimir', resultado.error); return }
    toast.success(resultado.encolado ? 'Comprobante encolado' : 'Comprobante enviado a la impresora', resultado.encolado ? 'La impresora no respondió; el puente reintenta solo.' : '')
  }

  return (
    <Modal open={open} onClose={onClose} title="Comprobante" className="max-w-4xl">
      <div className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block space-y-1 text-xs text-mute">
            <span>Comprobante</span>
            <Select aria-label="Tipo de comprobante" className="w-40" value={nivel} onChange={event => setNivel(event.target.value)}>
              {NIVELES_COMPROBANTE.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </Select>
          </label>
          <label className="block space-y-1 text-xs text-mute">
            <span>Formato</span>
            <Select aria-label="Formato de impresión" className="w-32" value={formato} onChange={event => setFormato(event.target.value)}>
              {FORMATOS_COMPROBANTE.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </Select>
          </label>
          <span className="flex flex-1 flex-wrap items-center justify-end gap-2">
            <Button type="button" variant="outline" onClick={imprimir} disabled={!html || cargando}>Descargar PDF</Button>
            {agente && <Button type="button" variant="outline" onClick={imprimirDirecto} disabled={cargando || enviando}>{enviando ? 'Enviando…' : 'Térmica directa'}</Button>}
            <Button type="button" onClick={imprimir} disabled={!html || cargando}>{cargando ? 'Preparando…' : 'Imprimir'}</Button>
          </span>
        </div>
        <p className="text-[11px] text-mute">
          Cada nivel imprime su propio QR privado. Para PDF, elegí «Guardar como PDF» en el diálogo de impresión.
        </p>
        <iframe
          title="Vista previa del comprobante"
          srcDoc={html}
          className={`h-[60vh] w-full rounded-xl border border-ink-600 bg-white ${formato === 'thermal' ? 'mx-auto max-w-[380px]' : ''}`}
        />
      </div>
    </Modal>
  )
}
