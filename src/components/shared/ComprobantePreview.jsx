import { useEffect, useState } from 'react'
import { Button, ConfirmDialog, Modal, Select, useToast } from '@/components/ui'
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
import { cargarImpresorasRemotas, configImpresora, confirmarJob, estadoAgente, imprimirConDestino, imprimirDocumento, impresoraPredeterminada } from '@/lib/printing/agent'
import { ticketComprobante } from '@/lib/printing/tickets'

// Vista previa real del comprobante: nivel (Rápido/Completo/Detallado) y
// formato físico se eligen acá y la última combinación queda recordada. El
// listado lo define la pantalla que lo usa (la página del pedido ofrece A4 y
// 80 mm y descarta el rollo de 58 mm). El formato inicial sigue al ancho de la
// impresora configurada en Impresoras.
// La vista previa usa el ancho real del papel (mm a 96 dpi) para que lo que se
// ve coincida con lo que sale impreso, sin franjas blancas a los costados.
const ANCHO_VISTA = { 'thermal-80': 'max-w-[302px]', 'thermal-58': 'max-w-[219px]', 'thermal-55': 'max-w-[208px]', thermal: 'max-w-[219px]' }
export default function ComprobantePreview({ order, open, onClose, formatos = FORMATOS_COMPROBANTE }) {
  const toast = useToast()
  const inicial = (() => {
    const preferido = formatoPreferido()
    const ancho = (() => { try { return Number(configImpresora()?.ancho) || 0 } catch { return 0 } })()
    const deImpresora = ancho === 80 ? 'thermal-80' : ancho === 58 ? 'thermal-58' : ''
    const disponibles = formatos.map(([id]) => id)
    if (preferido !== 'a4' && disponibles.includes(preferido)) return preferido
    if (deImpresora && disponibles.includes(deImpresora)) return deImpresora
    return disponibles.includes(preferido) ? preferido : formatos[0][0]
  })()
  const [nivel, setNivel] = useState(nivelPreferido)
  const [formato, setFormato] = useState(inicial)
  const [html, setHtml] = useState('')
  const [link, setLink] = useState('')
  const [cargando, setCargando] = useState(false)
  const [agente, setAgente] = useState(false)
  // Con impresora configurada en la empresa se puede imprimir aunque este
  // dispositivo no tenga agente local: el trabajo se encola al puente.
  const [hayImpresora, setHayImpresora] = useState(() => Boolean(impresoraPredeterminada()?.destino))
  const [enviando, setEnviando] = useState(false)
  const [estado, setEstado] = useState(null)
  const [confirmando, setConfirmando] = useState(false)
  const [jobEncColado, setJobEncColado] = useState(null)
  const [preguntaDialogo, setPreguntaDialogo] = useState(false)

  useEffect(() => {
    let activo = true
    estadoAgente().then((info) => { if (activo) { setAgente(Boolean(info.disponible)); setEstado(info) } })
    cargarImpresorasRemotas().then((store) => {
      if (activo) setHayImpresora(Boolean(imprimirConDestino(store).predeterminada?.destino))
    })
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

  // El diálogo del sistema es una acción manual: si el puente tiene trabajos
  // encolados, abrirlo podría duplicar el ticket cuando el reintento salga.
  function imprimirConDialogo() {
    if (!html || cargando) return
    if (Number(estado?.cola?.pendientes || 0) > 0) { setPreguntaDialogo(true); return }
    imprimir()
  }

  async function marcarConfirmado() {
    if (!jobEncColado || confirmando) return
    setConfirmando(true)
    try {
      await confirmarJob(jobEncColado)
      toast.success('Confirmado', 'El papel salió: la cola del puente quedó limpia.')
      setJobEncColado(null)
      setEstado(await estadoAgente({ forzar: true }))
    } catch (cause) {
      toast.error('No se pudo confirmar', cause?.message || '')
    } finally {
      setConfirmando(false)
    }
  }

  async function imprimirDirecto() {
    if (enviando) return
    setEnviando(true)
    const { ancho } = configImpresora()
    const resultado = await imprimirDocumento(ticketComprobante(order, { nivel, ancho, link }), { tipo: 'comprobante' })
    setEnviando(false)
    if (!resultado.ok) { toast.error('No se pudo imprimir', resultado.error || 'Revisá la impresora.'); return }
    if (resultado.encolado) {
      // La cola local se confirma con «Ya salió el papel»; la del puente se
      // confirma desde Configuración → Impresoras (ahí está el número secreto).
      setJobEncColado(resultado.remoto ? null : (resultado.jobId || null))
      toast.success(
        resultado.remoto ? 'Comprobante encolado al puente' : 'Comprobante encolado',
        resultado.remoto ? 'Lo imprime el puente cuando lo reclame.' : 'La impresora no respondió; el agente reintenta solo.',
      )
    } else {
      setJobEncColado(null)
      toast.success('Comprobante enviado a la impresora', '')
    }
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
              {formatos.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </Select>
          </label>
          <span className="flex flex-1 flex-wrap items-center justify-end gap-2">
            <Button type="button" variant="outline" onClick={imprimir} disabled={!html || cargando}>Descargar PDF</Button>
            {(agente || hayImpresora) && <Button type="button" variant="outline" onClick={imprimirDirecto} disabled={cargando || enviando}>{enviando ? 'Enviando…' : 'Impresión directa'}</Button>}
            <Button type="button" onClick={imprimirConDialogo} disabled={!html || cargando}>{cargando ? 'Preparando…' : 'Imprimir con diálogo'}</Button>
          </span>
        </div>
        {agente && Number(estado?.cola?.pendientes || 0) > 0 && (
          <p role="status" className="rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-xs text-warn">
            El puente tiene {estado.cola.pendientes} trabajo(s) encolado(s): la impresora no respondió y reintenta solo.
            {jobEncColado && (
              <button type="button" onClick={marcarConfirmado} disabled={confirmando} className="ml-2 font-semibold text-warn underline underline-offset-2 hover:text-fore">
                {confirmando ? 'Confirmando…' : 'Ya salió el papel'}
              </button>
            )}
          </p>
        )}
        {agente && Number(estado?.cola?.fallidos || 0) > 0 && !jobEncColado && (
          <p role="status" className="rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-xs text-bad">
            El puente tiene {estado.cola.fallidos} trabajo(s) fallido(s). Revisá la impresora en Configuración → Impresoras.
          </p>
        )}
        <p className="text-[11px] text-mute">
          Cada nivel imprime su propio QR privado. Para PDF, elegí «Guardar como PDF» en el diálogo de impresión.
        </p>
        <ConfirmDialog
          open={preguntaDialogo}
          title="Hay trabajos encolados en el puente"
          description="La impresora no respondió y el puente reintenta solo. Si imprimís por diálogo ahora, el ticket puede salir dos veces cuando el reintento llegue. ¿Continuar con el diálogo?"
          confirmLabel="Imprimir igual"
          onCancel={() => setPreguntaDialogo(false)}
          onConfirm={() => { setPreguntaDialogo(false); imprimir() }}
        />
        <iframe
          title="Vista previa del comprobante"
          srcDoc={html}
          className={`h-[60vh] w-full rounded-xl border border-ink-600 bg-white ${ANCHO_VISTA[formato] ? 'mx-auto ' + ANCHO_VISTA[formato] : ''}`}
        />
      </div>
    </Modal>
  )
}
