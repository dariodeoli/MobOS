import { useEffect, useRef, useState } from 'react'
import { Button, Card, Select, Modal, ConfirmDialog } from '@/components/ui'
import usePlantillasEmpresa from './impresion/usePlantillasEmpresa'
import EditorPlantilla from './impresion/EditorPlantilla'
import VistaPlantilla from './impresion/VistaPlantilla'
import {
  TIPOS_PLANTILLA,
  clonarPlantilla,
  erroresPlantilla,
  nombrePlantillaValido,
} from '@/lib/printing/plantillas'
import { avisoSalidaPlantilla } from '@/lib/printing/perfiles'
import { renderPlantilla, pdfPlantilla } from '@/lib/printing/renderPlantilla'
import { descargarArchivo } from '@/utils/descargarArchivo'

const sample = kind =>
  kind === 'comprobante'
    ? [
        {
          id: 'QA-507',
          number: 'QA-507',
          status: 'PAID',
          totalPyg: 180000,
          paidPyg: 180000,
          createdAt: '2026-10-15T12:00:00Z',
          orderNumber: 'QA-507',
          items: [
            {
              description: 'Funda de muestra',
              quantity: 1,
              unitPricePyg: 180000,
              totalPyg: 180000,
            },
          ],
          payments: [{ status: 'CONFIRMED', method: 'CASH', amountPyg: 180000 }],
          customer: { name: 'Cliente de muestra' },
        },
      ]
    : kind === 'etiquetas-stock'
      ? [
          {
            model: 'iPhone 15 · 128 GB',
            serial: '350000000000000',
            barcode: '350000000000000',
            qr: 'MOBOS:UNIDAD-QA-507',
            condition: 'Usado',
            battery: '90%',
            location: 'Sucursal de muestra',
            supplierCode: 'DEM',
            brand: 'MobOS',
          },
        ]
      : [
          {
            product: 'iPhone 15 · 128 GB',
            sku: 'SKU-QA-001',
            barcode: 'SKU-QA-001',
            price: 'Gs 4.850.000',
            brand: 'MobOS',
            qr: 'SKU-QA-001',
          },
        ]
export default function PlantillasImpresion() {
  const store = usePlantillasEmpresa(),
    [kind, setKind] = useState('etiquetas-producto'),
    [draft, setDraft] = useState(null),
    [render, setRender] = useState(null),
    [renderError, setRenderError] = useState(''),
    [overflow, setOverflow] = useState([]),
    [confirm, setConfirm] = useState(null),
    [exporting, setExporting] = useState(false)
  const epoch = useRef(0),
    signature = useRef(store.signature)
  signature.current = store.signature
  useEffect(() => {
    setDraft(null)
    setConfirm(null)
    setRender(null)
    setRenderError('')
    setExporting(false)
  }, [store.signature])
  useEffect(() => {
    const counter = epoch
    const request = ++counter.current
    setRender(null)
    setOverflow([])
    setRenderError('')
    if (!draft || draft.context !== store.signature) return
    const errors = erroresPlantilla(draft.kind, draft.definition)
    if (errors.length) {
      setRenderError(errors.join(' '))
      return
    }
    renderPlantilla({ kind: draft.kind, definition: draft.definition, data: sample(draft.kind) })
      .then(result => {
        if (request === epoch.current) setRender(result)
      })
      .catch(error => {
        if (request === epoch.current) setRenderError(error.message)
      })
    return () => {
      counter.current++
    }
  }, [draft, store.signature])
  const close = () => setDraft(null)
  const save = async () => {
    const context = store.signature
    const data = { name: draft.name.trim(), definition: draft.definition }
    const result = draft.id
      ? await store.mutate(
          'update',
          [draft.id, { ...data, revision: draft.revision }],
          'Plantilla guardada.',
        )
      : await store.mutate('create', [{ ...data, kind: draft.kind }], 'Plantilla creada.')
    if (result && signature.current === context)
      setDraft({ ...clonarPlantilla(result), context: context })
  }
  const exportPdf = async () => {
    const context = store.signature,
      request = epoch.current
    setExporting(true)
    setRenderError('')
    try {
      const blob = await pdfPlantilla(render)
      if (
        signature.current === context &&
        request === epoch.current &&
        !descargarArchivo('plantilla-muestra.pdf', blob)
      )
        throw Error('No se pudo descargar el PDF.')
    } catch (error) {
      if (signature.current === context && request === epoch.current) setRenderError(error.message)
    } finally {
      if (signature.current === context && request === epoch.current) setExporting(false)
    }
  }
  const remove = async () => {
    const row = confirm
    setConfirm(null)
    await store.mutate(
      'remove',
      [row.id, row.revision],
      'Plantilla eliminada y sus asignaciones retiradas.',
    )
  }
  const errors = draft ? erroresPlantilla(draft.kind, draft.definition) : []
  const original = store.templates.find(t => t.id === draft?.id)
  const dirty = Boolean(
    draft &&
    (!original ||
      draft.name !== original.name ||
      JSON.stringify(draft.definition) !== JSON.stringify(original.definition)),
  )
  return (
    <Card className="space-y-4 min-w-0" data-testid="plantillas-empresa">
      <h2 className="text-lg font-semibold">Plantillas de impresión</h2>
      <p className="text-sm text-mute">
        Papel, márgenes y contenido de cada documento. Las etiquetas de productos usan la plantilla
        predeterminada al descargar el PDF desde Productos.
      </p>
      <p className="text-sm text-mute">{avisoSalidaPlantilla()}</p>
      {store.esDemo && (
        <p className="text-sm text-mute">
          Demo: cambios guardados solo en la memoria de esta pestaña y empresa; no modifican datos
          reales.
        </p>
      )}
      {!store.puedeEditar && (
        <p className="text-sm text-mute">
          Modo de lectura. Solo administración puede cambiar plantillas y predeterminados.
        </p>
      )}
      {store.error && (
        <p role="alert" className="text-sm text-danger">
          {store.error}
        </p>
      )}
      {store.notice && (
        <p role="status" className="text-sm text-fore">
          {store.notice}
        </p>
      )}
      <label className="block space-y-1 text-sm">
        Tipo de documento
        <Select
          className="min-h-11"
          aria-label="Tipo de documento"
          value={kind}
          onChange={e => setKind(e.target.value)}
        >
          {Object.entries(TIPOS_PLANTILLA).map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </Select>
      </label>
      <div className="flex flex-wrap gap-2">
        <Button
          className="min-h-11"
          disabled={!store.puedeEditar || store.loading || store.busy}
          onClick={() => {
            const preset = store.presets.find(p => p.kind === kind)
            if (preset)
              setDraft({
                ...clonarPlantilla(preset),
                name: `Mi ${preset.name}`,
                context: store.signature,
              })
          }}
        >
          Nueva plantilla
        </Button>
        <Button
          className="min-h-11"
          variant="ghost"
          disabled={store.loading || store.busy}
          onClick={store.recargar}
        >
          Actualizar
        </Button>
      </div>
      <p className="text-xs text-mute">
        Predeterminado:{' '}
        {store.templates.find(t => t.id === store.effective[kind]?.templateId)?.name ||
          'Formato incorporado'}{' '}
        ·{' '}
        {store.effective[kind]?.source === 'branch'
          ? 'sucursal'
          : store.effective[kind]?.source === 'company'
            ? 'empresa'
            : 'sin personalización'}
        . Cambiarlo no calibra la impresora. El servidor restringe los cambios de empresa si tu
        sesión está limitada a una sucursal.
      </p>
      <Button
        className="min-h-11"
        variant="ghost"
        disabled={!store.puedeEditar || store.busy || !store.effective[kind]?.templateId}
        onClick={() =>
          store.mutate(
            'setDefault',
            [{ kind, branchId: store.contexto.sucursalId, templateId: null }],
            'Asignación retirada.',
          )
        }
      >
        Quitar asignación de {store.contexto.sucursalId ? 'esta sucursal' : 'empresa'}
      </Button>
      {store.contexto.sucursalId && (
        <Button
          className="min-h-11"
          variant="ghost"
          disabled={!store.puedeEditar || store.busy}
          onClick={() =>
            store.mutate(
              'setDefault',
              [{ kind, branchId: null, templateId: null }],
              'Asignación de empresa retirada.',
            )
          }
        >
          Quitar asignación de toda la empresa
        </Button>
      )}
      {store.loading && <p role="status">Cargando plantillas…</p>}
      <ul className="space-y-3">
        {store.templates
          .filter(t => t.kind === kind)
          .map(t => (
            <li key={t.id} className="rounded-xl border border-ink-600 p-3 space-y-2">
              <p className="font-semibold break-words">{t.name}</p>
              <p className="text-xs text-mute">
                {t.definition.page.widthMm} × {t.definition.page.heightMm ?? 'continuo'} mm ·
                revisión {t.revision}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  className="min-h-11"
                  variant="ghost"
                  onClick={() => setDraft({ ...clonarPlantilla(t), context: store.signature })}
                >
                  {store.puedeEditar ? 'Editar' : 'Ver'} {t.name}
                </Button>
                <Button
                  className="min-h-11"
                  variant="ghost"
                  disabled={!store.puedeEditar || store.busy}
                  onClick={() =>
                    store.mutate(
                      'action',
                      [
                        t.id,
                        {
                          action: 'duplicate',
                          revision: t.revision,
                          name: `${t.name.slice(0, 74)} copia`,
                        },
                      ],
                      'Plantilla duplicada.',
                    )
                  }
                >
                  Duplicar
                </Button>
                <Button
                  className="min-h-11"
                  variant="ghost"
                  disabled={!store.puedeEditar || store.busy}
                  onClick={() => setConfirm({ ...t, action: 'restore', context: store.signature })}
                >
                  Restaurar
                </Button>
                <Button
                  className="min-h-11"
                  variant="ghost"
                  disabled={!store.puedeEditar || store.busy}
                  onClick={() =>
                    store.mutate(
                      'setDefault',
                      [{ kind, branchId: store.contexto.sucursalId, templateId: t.id }],
                      'Predeterminado actualizado.',
                    )
                  }
                >
                  Usar en {store.contexto.sucursalId ? 'esta sucursal' : 'empresa'}
                </Button>
                {store.contexto.sucursalId && (
                  <Button
                    className="min-h-11"
                    variant="ghost"
                    disabled={!store.puedeEditar || store.busy}
                    onClick={() =>
                      store.mutate(
                        'setDefault',
                        [{ kind, branchId: null, templateId: t.id }],
                        'Predeterminado de empresa actualizado.',
                      )
                    }
                  >
                    Usar en toda la empresa
                  </Button>
                )}
                <Button
                  className="min-h-11"
                  variant="ghost"
                  disabled={!store.puedeEditar || store.busy}
                  onClick={() => setConfirm({ ...t, action: 'remove', context: store.signature })}
                >
                  Eliminar
                </Button>
              </div>
            </li>
          ))}
      </ul>
      {!store.loading && !store.templates.some(t => t.kind === kind) && (
        <p className="text-sm text-mute">
          No hay plantillas guardadas para este tipo. Creá una a partir del formato incorporado.
        </p>
      )}
      <Modal
        open={Boolean(draft && draft.context === store.signature)}
        onClose={store.busy || exporting ? () => {} : close}
        title="Editar plantilla de impresión"
        dirty={dirty}
        busy={store.busy || exporting}
        size="amplio"
      >
        {draft && (
          <div className="space-y-5">
            <EditorPlantilla
              draft={draft}
              onChange={setDraft}
              readOnly={!store.puedeEditar || store.busy || exporting}
            />
            <p className="text-xs text-mute">
              Vista previa con datos ficticios de muestra. Los datos reales se completan al
              imprimir; no se guardan dentro de la plantilla.
            </p>
            {render && <VistaPlantilla render={render} onErrors={setOverflow} />}
            {(renderError || overflow.length > 0) && (
              <p role="alert" className="text-sm text-danger">
                {renderError || overflow.join(' ')}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                className="min-h-11"
                variant="ghost"
                disabled={!render || Boolean(renderError) || overflow.length > 0 || exporting}
                onClick={exportPdf}
              >
                {exporting ? 'Generando…' : 'Descargar PDF de muestra'}
              </Button>
              <Button
                className="min-h-11"
                disabled={
                  !store.puedeEditar ||
                  store.busy ||
                  exporting ||
                  errors.length > 0 ||
                  !nombrePlantillaValido(draft.name)
                }
                onClick={save}
              >
                Guardar plantilla
              </Button>
              <Button
                className="min-h-11"
                variant="ghost"
                disabled={store.busy || exporting}
                onClick={close}
              >
                {dirty ? 'Descartar cambios' : 'Cerrar editor'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
      <ConfirmDialog
        open={Boolean(confirm && confirm.context === store.signature)}
        onCancel={() => setConfirm(null)}
        title={
          confirm?.action === 'restore' ? 'Restaurar formato incorporado' : 'Eliminar plantilla'
        }
        description={
          confirm?.action === 'restore'
            ? 'Se reemplaza la distribución guardada por el formato incorporado de este tipo.'
            : 'Se retiran también sus asignaciones predeterminadas. Esta acción no borra documentos ni ventas.'
        }
        confirmLabel={confirm?.action === 'restore' ? 'Restaurar' : 'Eliminar'}
        onConfirm={
          confirm?.action === 'restore'
            ? async () => {
                const t = confirm
                setConfirm(null)
                await store.mutate(
                  'action',
                  [t.id, { action: 'restore', revision: t.revision }],
                  'Formato incorporado restaurado.',
                )
              }
            : remove
        }
      />
    </Card>
  )
}
