import { useCallback, useEffect, useState } from 'react'
import { Aviso, Button, ConfirmDialog, Modal, useToast } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import {
  FORMATOS_COMPROBANTE,
  NIVELES_MODELO,
  buildOrderReceiptHtml,
  formatoPreferido,
  nivelPreferido,
  recordarPreferencia,
  tokenDeNivel,
  accessUrlFor,
  trackingUrlFor,
} from './OrderReceipt'
import { printHtml } from '@/utils/printHtml'
import { getLogoDataUrl } from '@/lib/tenantLogo'
import { logoRasterDesdeDataUrl } from '@/lib/printing/logoRaster'
import { cargarImpresorasRemotas, configImpresora, confirmarJob, esIdBackend, estadoAgente, imprimirConDestino, imprimirDocumento, impresoraPredeterminada } from '@/lib/printing/agent'
import { printingApi } from '@/lib/api/printing'
import { isDemoRuntime } from '@/lib/demoMode'
import { encolarComprobanteDemo } from '@/lib/printing/demo'
import { formatoDeTipo, recordarFormatoDeTipo } from '@/lib/printing/preferencias'
import { ticketComprobante } from '@/lib/printing/tickets'

// Vista previa real del comprobante: nivel (Rápido/Completo/Detallado) y
// formato físico se eligen acá y la última combinación queda recordada. El
// listado lo define la pantalla que lo usa (la página del pedido ofrece A4 y el
// rollo de 58 mm con diseño propio). El formato inicial sigue al ancho de la
// impresora configurada en Impresoras.
// La vista previa usa el ancho real del papel (mm a 96 dpi) para que lo que se
// ve coincida con lo que sale impreso, sin franjas blancas a los costados.
const ANCHO_VISTA = { 'thermal-80': 'max-w-[302px]', 'thermal-58': 'max-w-[219px]', 'thermal-55': 'max-w-[208px]', thermal: 'max-w-[219px]' }
export default function ComprobantePreview({ order, open, onClose, formatos = FORMATOS_COMPROBANTE }) {
  const toast = useToast()
  const inicial = (() => {
    const preferido = formatoPreferido()
    // #209: si no hay preferencia global, vale el último formato usado para
    // este tipo de documento (comprobante).
    const delTipo = formatoDeTipo('comprobante') || preferido
    const ancho = (() => { try { return Number(configImpresora()?.ancho) || 0 } catch { return 0 } })()
    const deImpresora = ancho === 80 ? 'thermal-80' : ancho === 58 ? 'thermal-58' : ''
    const disponibles = formatos.map(([id]) => id)
    if (delTipo !== 'a4' && disponibles.includes(delTipo)) return delTipo
    if (deImpresora && disponibles.includes(deImpresora)) return deImpresora
    return disponibles.includes(delTipo) ? delTipo : formatos[0][0]
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
  // Cola del puente (backend): pendientes para la impresora de destino y la
  // confirmación explícita de reimpresión cuando el guarda anti-duplicados
  // bloquea un click repetido (#128).
  const [destino, setDestino] = useState(() => impresoraPredeterminada())
  const [pendientesRemotos, setPendientesRemotos] = useState(0)
  const [preguntaDuplicado, setPreguntaDuplicado] = useState(null)

  const cargarPendientes = useCallback(async (impresora = destino) => {
    try {
      const datos = await printingApi.trabajos({ state: 'PENDIENTE', limit: 100 })
      const esDeLaImpresora = (trabajo) => {
        if (!impresora?.destino) return true
        if (esIdBackend(impresora.id)) return trabajo.printerId === impresora.id
        return trabajo.destination === impresora.destino
      }
      setPendientesRemotos((datos?.jobs || []).filter(esDeLaImpresora).length)
    } catch {
      setPendientesRemotos(0)
    }
  }, [destino])

  useEffect(() => {
    let activo = true
    estadoAgente().then((info) => { if (activo) { setAgente(Boolean(info.disponible)); setEstado(info) } })
    cargarImpresorasRemotas().then((store) => {
      if (!activo) return
      const elegida = imprimirConDestino(store).predeterminada || null
      setDestino(elegida)
      setHayImpresora(Boolean(elegida?.destino))
    })
    return () => { activo = false }
  }, [])

  useEffect(() => {
    if (!open) return undefined
    cargarPendientes()
    return undefined
  }, [open, cargarPendientes])

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
    recordarFormatoDeTipo('comprobante', formato)
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

  async function imprimirDirecto(reimprimir = false) {
    if (enviando) return
    setEnviando(true)
    const { ancho } = configImpresora()
    // Logo de la empresa en el encabezado térmico: variante oscura (papel
    // blanco) convertida a mapa de bits 1-bit para GS v 0.
    const logo = await logoRasterDesdeDataUrl(await getLogoDataUrl('light'), { anchoMax: ancho === 80 ? 512 : 320 })
    // El pedido identifica el trabajo en la cola y alimenta el guarda
    // anti-duplicados (#128): un click repetido se bloquea y, si la persona
    // confirma, sale como reimpresión explícita.
    const referencia = String(order?.orderNumber || order?.codigo || order?.id || '')
    if (isDemoRuntime) {
      // Demo (#196): el encolado se simula con la misma ventana anti-duplicados
      // que el backend; «Reimprimir igual» agrega una copia ficticia.
      const simulado = encolarComprobanteDemo({ reference: referencia, force: reimprimir })
      setEnviando(false)
      if (simulado.duplicado) { setPreguntaDuplicado({ mensaje: simulado.mensaje }); return }
      setJobEncColado(null)
      toast.success(reimprimir ? 'Reimpresión encolada (demo)' : 'Comprobante encolado (demo)', 'Dato ficticio: no se envió nada al puente.')
      return
    }
    const resultado = await imprimirDocumento(ticketComprobante(order, { nivel, ancho, link, logo }), { tipo: 'comprobante', ref: referencia, reimprimir })
    setEnviando(false)
    if (resultado.duplicado) { setPreguntaDuplicado({ mensaje: resultado.error }); return }
    if (!resultado.ok) { toast.error('No se pudo imprimir', resultado.error || 'Revisá la impresora.'); return }
    if (resultado.encolado) {
      // La cola local se confirma con «Ya salió el papel»; la del puente se
      // confirma desde Configuración → Impresoras (ahí está el número secreto).
      setJobEncColado(resultado.remoto ? null : (resultado.jobId || null))
      cargarPendientes()
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
<<<<<<< HEAD
    <Modal open={open} onClose={onClose} title="Comprobante" size="amplio">
=======
    <Modal open={open} onClose={onClose} title="Comprobante" size="3xl">
>>>>>>> origin/slot/diseno
      <div className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block space-y-1 text-xs text-mute">
            <span>Comprobante</span>
            <div role="radiogroup" aria-label="Tipo de comprobante" className="flex items-center gap-1">
              {NIVELES_MODELO.map(({ id, label, icon }) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={nivel === id}
                  aria-label={`Comprobante ${label}`}
                  title={label}
                  onClick={() => setNivel(id)}
                  className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fono/50 ${nivel === id ? 'border-fono/50 bg-fono/10 text-fono-light' : 'border-ink-500 text-mute hover:border-fono hover:text-fore'}`}
                >
                  <Icon name={icon} className="h-4 w-4" />
                  <span className="hidden sm:inline">{label}</span>
                </button>
              ))}
            </div>
          </label>
          <label className="block space-y-1 text-xs text-mute">
            <span>Formato</span>
            <div role="radiogroup" aria-label="Formato de impresión" className="flex items-center gap-1">
              {formatos.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={formato === id}
                  aria-label={`Formato ${label}`}
                  title={label}
                  onClick={() => setFormato(id)}
                  className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fono/50 ${formato === id ? 'border-fono/50 bg-fono/10 text-fono-light' : 'border-ink-500 text-mute hover:border-fono hover:text-fore'}`}
                >
                  <Icon name="receipt" className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>
          </label>
          <span className="flex flex-1 flex-wrap items-center justify-end gap-2">
            <Button type="button" variant="outline" onClick={imprimir} disabled={!html || cargando}>Descargar PDF</Button>
            {(agente || hayImpresora) && <Button type="button" variant="outline" onClick={() => imprimirDirecto()} disabled={cargando || enviando}>{enviando ? 'Enviando…' : 'Impresión directa'}</Button>}
            <Button type="button" onClick={imprimirConDialogo} disabled={!html || cargando}>{cargando ? 'Preparando…' : 'Imprimir con diálogo'}</Button>
          </span>
        </div>
        {agente && Number(estado?.cola?.pendientes || 0) > 0 && (
          <Aviso tono="warn" compact className="px-3">
            El puente tiene {estado.cola.pendientes} trabajo(s) encolado(s): la impresora no respondió y reintenta solo.
            {jobEncColado && (
              <button type="button" onClick={marcarConfirmado} disabled={confirmando} className="ml-2 font-semibold text-warn underline underline-offset-2 hover:text-fore">
                {confirmando ? 'Confirmando…' : 'Ya salió el papel'}
              </button>
            )}
          </Aviso>
        )}
        {agente && Number(estado?.cola?.fallidos || 0) > 0 && !jobEncColado && (
          <Aviso tono="error" compact role="status">
            El puente tiene {estado.cola.fallidos} trabajo(s) fallido(s). Revisá la impresora en Configuración → Impresoras.
          </Aviso>
        )}
        {pendientesRemotos > 0 && (
          <Aviso tono="warn" compact className="px-3">
            La cola del puente tiene {pendientesRemotos} trabajo(s) pendiente(s) para {destino?.nombre || 'la impresora configurada'}. Si esta impresión ya se mandó, revisá y cancelá en Configuración → Estado del sistema antes de mandar otra.
          </Aviso>
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
        {/* Guarda anti-duplicados (#128): el backend bloqueó un encolado
            idéntico reciente y acá se ofrece la reimpresión explícita. */}
        <ConfirmDialog
          open={Boolean(preguntaDuplicado)}
          title="Ya hay una impresión pendiente"
          description={`${preguntaDuplicado?.mensaje || 'Este comprobante ya está en la cola del puente.'} Confirmá solo si querés una copia más: son trabajos distintos y los dos van a salir cuando el puente reconecte.`}
          confirmLabel="Reimprimir igual"
          busy={enviando}
          onCancel={() => setPreguntaDuplicado(null)}
          onConfirm={() => { setPreguntaDuplicado(null); imprimirDirecto(true) }}
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
