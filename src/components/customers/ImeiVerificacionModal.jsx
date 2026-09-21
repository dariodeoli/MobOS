import { useEffect, useState } from 'react'
import { Badge, Button, Modal, Skeleton, useToast } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import { api } from '@/lib/api/client'
import { demoConsultaImei, htmlComprobanteImei, imeiValido, resumenImei, textoNota } from '@/lib/imeiComprobante'
import { ticketVerificacionImei } from '@/lib/printing/tickets'
import { imprimirConDialogo, imprimirDocumento, puedeCaerAlDialogo } from '@/lib/printing/agent'

// Verificación de IMEI del cliente (#203): muestra el resultado que ya consultó
// INV (#193/#200) con la info mínima (estado, fecha y fuente IMEIcheck.net) y
// permite adjuntarlo a un comentario o a la nota pública, o imprimirlo.
// En demo no consulta al proveedor: simula el resultado y lo avisa.
export default function ImeiVerificacionModal({ open, onClose, imei = '', cliente = '', esDemo = false, onAgregarComentario, onAgregarNotaPublica }) {
  const toast = useToast()
  const [cargando, setCargando] = useState(false)
  const [consulta, setConsulta] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open || !imei) return undefined
    let vivo = true
    setConsulta(null); setError(''); setBusy(false)
    if (esDemo) { setConsulta(demoConsultaImei(imei)); return () => { vivo = false } }
    if (!imeiValido(imei)) {
      setError('El serial del equipo no es un IMEI de 15 dígitos: la verificación se consulta por IMEI.')
      return () => { vivo = false }
    }
    setCargando(true)
    api.get(`/api/imei?imei=${encodeURIComponent(imei)}&limit=1`)
      .then((data) => { if (vivo) setConsulta(Array.isArray(data?.consultas) ? data.consultas[0] || null : null) })
      .catch((cause) => { if (vivo) setError(cause?.message || 'No se pudo consultar la verificación.') })
      .finally(() => { if (vivo) setCargando(false) })
    return () => { vivo = false }
  }, [open, imei, esDemo])

  const resumen = consulta ? resumenImei(consulta, { cliente }) : null

  async function adjuntar(destino) {
    if (!resumen || busy) return
    setBusy(true)
    try {
      await (destino === 'publica' ? onAgregarNotaPublica?.(textoNota(resumen)) : onAgregarComentario?.(textoNota(resumen)))
      toast.success(destino === 'publica' ? 'Agregado a la nota pública.' : 'Agregado al comentario interno.')
    } catch (cause) {
      toast.error('No se pudo adjuntar', cause?.message)
    } finally { setBusy(false) }
  }

  async function imprimir() {
    if (!resumen || busy) return
    setBusy(true)
    try {
      const resultado = await imprimirDocumento(ticketVerificacionImei(resumen), { tipo: 'imei-check' })
      if (resultado?.ok) {
        toast.success(resultado.encolado ? 'Comprobante encolado' : 'Comprobante enviado a la impresora.')
        return
      }
      if (puedeCaerAlDialogo(resultado)) {
        imprimirConDialogo(htmlComprobanteImei(resumen, { tienda: cliente }))
        return
      }
      toast.info('No se pudo imprimir', resultado?.error || 'Revisá la impresora.')
    } finally { setBusy(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Verificación de IMEI" className="max-w-lg">
      <div className="space-y-4" data-testid="imei-verificacion">
        <div className="rounded-xl border border-ink-600 bg-ink-800 p-3 text-sm">
          <p className="text-[11px] font-medium uppercase tracking-wider text-mute">Equipo</p>
          <p className="mt-1 font-semibold">{cliente || 'Cliente'}</p>
          <p className="mt-0.5 font-mono text-xs text-mute">IMEI {resumen?.imei || (imei ? imei : '—')}</p>
        </div>

        {cargando && <div className="space-y-2" aria-busy="true"><Skeleton className="h-16 w-full" /><Skeleton className="h-10 w-full" /></div>}

        {!cargando && error && <p role="alert" className="rounded-lg border border-warn/30 bg-warn/5 px-3 py-2 text-sm text-warn">{error}</p>}

        {!cargando && !error && !consulta && (
          <div className="rounded-xl border border-ink-600 p-3 text-sm text-mute">
            <p>Todavía no hay una verificación de este IMEI.</p>
            <p className="mt-1 text-xs">La consulta al proveedor es una función paga y se ejecuta desde Inventario → Verificación de IMEI (con confirmación del costo).</p>
          </div>
        )}

        {!cargando && resumen && (
          <>
            <div className="rounded-xl border border-ink-600 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge color={resumen.estado === 'verificado' ? 'green' : resumen.estado === 'parcial' ? 'orange' : 'slate'}>{resumen.etiqueta}</Badge>
                {resumen.simulado && <Badge color="blue">Simulada en demo</Badge>}
              </div>
              <p className="mt-2 text-sm font-semibold">{resumen.detalle}</p>
              <p className="mt-1 text-xs text-mute">Fuente {resumen.fuente} · {resumen.fechaTexto || 'sin fecha'}</p>
              {resumen.campos.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-xs text-mute">
                  {resumen.campos.map((campo) => <li key={campo.etiqueta}><b className="text-fore">{campo.etiqueta}:</b> {campo.valor}</li>)}
                </ul>
              )}
              <p className="mt-2 text-[11px] text-mute">Comprobante informativo, sin costos ni datos internos.</p>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" disabled={busy} onClick={() => adjuntar('comentario')}>
                <Icon name="edit" className="h-4 w-4" />
                Adjuntar al comentario
              </Button>
              <Button type="button" variant="outline" disabled={busy} onClick={() => adjuntar('publica')}>
                <Icon name="external" className="h-4 w-4" />
                Agregar a la nota pública
              </Button>
              <Button type="button" disabled={busy} onClick={imprimir}>
                <Icon name="printer" className="h-4 w-4" />
                Imprimir comprobante
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
