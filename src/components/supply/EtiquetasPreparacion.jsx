import { useEffect, useState } from 'react'
import { Button, Modal, Skeleton, useToast } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import CompartirImagen from '@/components/shared/CompartirImagen'
import { PIE_ACCIONES } from '@/components/shared/formulario'
import { CELDA_IDENTIDAD } from '@/components/shared/tabla'
import { printHtml } from '@/utils/printHtml'
import { resources } from '@/lib/api'
import { configImpresora, imprimirConDialogo, imprimirDocumento, puedeCaerAlDialogo } from '@/lib/printing/agent'
import { ticketEtiquetasLote } from '@/lib/printing/tickets'
import { buildEtiquetasLoteHtml } from '@/components/shared/OrderReceipt'

// Abastecimiento · F3 (#250 §7): etiquetas de la preparación.
// Una etiqueta por unidad comprada (`PRODUCTO n DE N`, variante, IMEI o
// «pendiente», compra, pedido y destino). Salen por la térmica del tipo
// `etiquetas-lote` (ESC/POS, un corte por unidad) con el diálogo como respaldo,
// o se comparten/descargan desde el mismo HTML (contrato de PRN en
// docs/ETIQUETAS-LOTE.md). También permite reimprimir una sola unidad.

const formatosPorAncho = (ancho) => (Number(ancho) === 80 ? 'thermal-80' : 'thermal-58')

export default function EtiquetasPreparacion({ open, onClose, compra }) {
  const toast = useToast()
  const [datos, setDatos] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState('')

  useEffect(() => {
    if (!open || !compra?.id) return undefined
    let vigente = true
    setDatos(null)
    setError('')
    setCargando(true)
    resources.supplyPurchases.labels(compra.id)
      .then((respuesta) => { if (vigente) setDatos(respuesta) })
      .catch((causa) => { if (vigente) setError(causa?.message || 'No se pudieron cargar las etiquetas.') })
      .finally(() => { if (vigente) setCargando(false) })
    return () => { vigente = false }
  }, [open, compra?.id])

  const etiquetas = datos?.etiquetas || []
  const resumen = datos?.resumen || {}
  const codigo = datos?.compra?.code || compra?.code || ''
  const conImei = etiquetas.filter((etiqueta) => !etiqueta.pendiente).length

  async function imprimir(lista, clave, exito) {
    if (!lista.length || enviando) return
    setEnviando(clave)
    try {
      const { ancho } = configImpresora()
      const resultado = await imprimirDocumento(ticketEtiquetasLote(lista, { ancho, compra: codigo }), { tipo: 'etiquetas-lote' })
      if (resultado?.ok) {
        if (resultado.encolado) toast.success('Etiquetas encoladas', resultado.remoto ? 'Las imprime el puente cuando las reclame.' : 'La impresora no respondió; se reintenta solo.')
        else toast.success(exito, `${lista.length} etiqueta(s) · compra ${codigo}.`)
        return
      }
      if (puedeCaerAlDialogo(resultado)) {
        const html = await buildEtiquetasLoteHtml(lista, { ancho, compra: codigo })
        await imprimirConDialogo(html)
        return
      }
      toast.error('No se pudo imprimir', resultado?.error || 'Revisá la impresora.')
    } finally {
      setEnviando('')
    }
  }

  async function descargar() {
    const { ancho } = configImpresora()
    await printHtml(await buildEtiquetasLoteHtml(etiquetas, { ancho, compra: codigo }))
  }

  return (
    <Modal open={open} onClose={onClose} title="Etiquetas de la preparación" size="amplio">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-mute">
            Una etiqueta por unidad comprada, con su IMEI o «pendiente». Escaneá el código en la preparación y el despacho.
          </p>
          {compra?.code && <span className="font-mono text-xs text-mute">{compra.code}</span>}
        </div>

        {cargando ? (
          <div className="space-y-2"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>
        ) : error ? (
          <p role="alert" className="text-sm text-bad">{error}</p>
        ) : (
          <>
            <p className="flex flex-wrap items-center gap-2 text-xs text-mute">
              <span className="rounded-full border border-ink-600 px-2 py-0.5">{etiquetas.length} unidad(es)</span>
              <span className="rounded-full border border-ink-600 px-2 py-0.5">{conImei} con IMEI</span>
              <span className={`rounded-full border px-2 py-0.5 ${resumen.pendientes ? 'border-warn/40 text-warn' : 'border-ink-600'}`}>{etiquetas.length - conImei} pendiente(s)</span>
            </p>
            <div className="max-h-80 space-y-1.5 overflow-y-auto rounded-xl border border-ink-600 p-2" data-testid="etiquetas-preparacion-lista">
              {etiquetas.map((etiqueta) => (
                <div key={`${etiqueta.n}-${etiqueta.imei || 'pendiente'}`} className="flex flex-wrap items-center gap-2 rounded-lg border border-ink-600 px-2.5 py-2">
                  <span className="w-12 shrink-0 font-mono text-xs text-mute tabular-nums">{etiqueta.n}/{etiqueta.total}</span>
                  <span className="min-w-0 flex-1">
                    <span className={`block ${CELDA_IDENTIDAD}`} title={etiqueta.producto}>{etiqueta.producto || 'Producto'}{etiqueta.capacidad ? ` · ${etiqueta.capacidad}` : ''}</span>
                    <span className="mt-0.5 block truncate font-mono text-[11px] text-mute">{etiqueta.pendiente ? 'Pendiente · se carga antes de despachar' : etiqueta.imei}</span>
                  </span>
                  {etiqueta.pedido ? <span className="text-[11px] text-mute">Pedido {etiqueta.pedido}</span> : null}
                  <Button type="button" variant="outline" className="h-8 px-2 text-xs" disabled={Boolean(enviando)} onClick={() => imprimir([etiqueta], `n-${etiqueta.n}`, 'Etiqueta enviada a la impresora.')}>
                    <Icon name="printer" className="h-3.5 w-3.5" />Reimprimir
                  </Button>
                </div>
              ))}
            </div>
          </>
        )}

        <div className={PIE_ACCIONES}>
          <Button type="button" variant="ghost" onClick={onClose}>Cerrar</Button>
          <CompartirImagen
            construirHtml={() => buildEtiquetasLoteHtml(etiquetas, { ancho: configImpresora().ancho, compra: codigo })}
            nombre={`etiquetas-preparacion-${codigo || 'compra'}`}
            titulo="Etiquetas de la preparación"
            texto={`${etiquetas.length} etiqueta(s) · compra ${codigo}`}
            formato={formatosPorAncho(configImpresora().ancho)}
            disabled={!etiquetas.length || Boolean(enviando)}
          />
          <Button type="button" variant="outline" disabled={!etiquetas.length || Boolean(enviando)} onClick={descargar}>
            <Icon name="download" className="h-4 w-4" />Descargar PDF
          </Button>
          <Button type="button" disabled={!etiquetas.length || Boolean(enviando)} onClick={() => imprimir(etiquetas, 'todas', 'Etiquetas enviadas a la impresora.')}>
            <Icon name="printer" className="h-4 w-4" />{enviando === 'todas' ? 'Enviando…' : 'Imprimir etiquetas'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
