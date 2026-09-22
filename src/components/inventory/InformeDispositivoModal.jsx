import { useEffect, useState } from 'react'
import { Button, Modal, Select } from '@/components/ui'
import { buildInformeDispositivoHtml, printInformeDispositivo } from '@/components/shared/OrderReceipt'
import VistaPreviaPapel from '@/components/shared/VistaPreviaPapel'
import { datosInformeDispositivo } from '@/lib/printing/informeDispositivo'
import { ticketInformeDispositivo } from '@/lib/printing/tickets'
import { imprimirDocumento, puedeCaerAlDialogo } from '@/lib/printing/agent'
import { demoConsultaImei } from '@/lib/imeiComprobante'
import { isDemoRuntime } from '@/lib/demoMode'
import { api } from '@/lib/api/client'

// Informe de dispositivo (#240): vista previa imprimible en 80 mm y A4, con el
// QR al informe público. Toma los datos de la unidad (INV) y la última consulta
// de IMEI; la impresión directa usa el ESC/POS y el diálogo queda de respaldo.
const FORMATOS = [['thermal-80', '80 mm'], ['a4', 'A4'], ['thermal-58', '58 mm']]
const anchoDeFormato = (formato) => {
  if (formato === 'a4') return 80
  return Number(String(formato).replace('thermal-', '')) || 80
}

export default function InformeDispositivoModal({ unit, open, onClose, onResult }) {
  const [formato, setFormato] = useState('thermal-80')
  const [datos, setDatos] = useState(null)
  const [html, setHtml] = useState('')
  const [cargando, setCargando] = useState(false)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    if (!open || !unit) return undefined
    let activo = true
    setCargando(true)
    ;(async () => {
      // Última consulta de IMEI de la unidad (INV): en demo se simula.
      let consulta = null
      try {
        if (isDemoRuntime) consulta = demoConsultaImei(unit.serial)
        else consulta = (await api.get(`/api/imei?imei=${encodeURIComponent(unit.serial)}&limit=1`))?.consultas?.[0] || null
      } catch { consulta = null }
      if (!activo) return
      const normalizado = datosInformeDispositivo(unit, { consulta })
      setDatos(normalizado)
      setHtml(await buildInformeDispositivoHtml(normalizado, { format: formato }))
      if (activo) setCargando(false)
    })()
    return () => { activo = false }
  }, [open, unit, formato])

  async function imprimirDirecto() {
    if (!datos || enviando) return
    setEnviando(true)
    try {
      const resultado = await imprimirDocumento(ticketInformeDispositivo(datos, { ancho: anchoDeFormato(formato) }), { tipo: 'informe-dispositivo', ref: datos.serial })
      if (!resultado?.ok && puedeCaerAlDialogo(resultado)) {
        await printInformeDispositivo(datos, { format: formato })
        return
      }
      onResult?.(resultado, 'Informe')
    } finally {
      setEnviando(false)
    }
  }

  function descargarPdf() {
    if (!html) return
    return printInformeDispositivo(datos, { format: formato })
  }

  return (
    <Modal open={open} onClose={onClose} title="Informe del dispositivo" size="amplio">
      <div className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <label className="block space-y-1 text-xs text-mute">
            <span>Formato</span>
            <Select aria-label="Formato del informe" className="w-32" value={formato} onChange={(event) => setFormato(event.target.value)}>
              {FORMATOS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </Select>
          </label>
          <span className="flex flex-wrap items-center justify-end gap-2">
            <Button type="button" variant="outline" onClick={descargarPdf} disabled={!html || cargando}>Descargar PDF</Button>
            <Button type="button" onClick={imprimirDirecto} disabled={!datos || cargando || enviando}>{enviando ? 'Enviando…' : 'Impresión directa'}</Button>
          </span>
        </div>
        <p className="text-[11px] text-mute">El QR abre el informe público de la unidad. La impresión directa sale por la impresora configurada (80 mm por defecto); «Descargar PDF» guarda la versión A4 o del rollo.</p>
        <VistaPreviaPapel formato={formato} contenido={html} titulo="Vista previa del informe" />
      </div>
    </Modal>
  )
}
