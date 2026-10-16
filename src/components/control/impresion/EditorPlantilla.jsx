import { useState } from 'react'
import { Button, FormField, Input, Select } from '@/components/ui'
import { CONTENIDOS, OBLIGATORIOS, OPCIONALES, tipoElemento } from '@/lib/printing/plantillas'
import { PERFILES_IMPRESION, aplicarPerfilPlantilla } from '@/lib/printing/perfiles'
import { moverElemento } from '@/lib/printing/geometria'

export default function EditorPlantilla({ draft, onChange, readOnly = false }) {
  const { kind, definition: d } = draft
  const [selected, setSelected] = useState(d.elements[0]?.id)
  const receipt = kind === 'comprobante',
    element = d.elements.find(e => e.id === selected) || d.elements[0]
  const change = next => onChange({ ...draft, definition: next })
  const page = (key, value) => change({ ...d, page: { ...d.page, [key]: value } })
  const number = (label, value, set, { disabled = false, min = 0, max = 2000 } = {}) => (
    <FormField key={label} label={label}>
      <Input
        className="min-h-11"
        aria-label={label}
        type="number"
        step="0.01"
        min={min}
        max={max}
        value={value ?? ''}
        disabled={readOnly || disabled}
        onChange={e => set(e.target.value === '' ? null : Number(e.target.value))}
      />
    </FormField>
  )
  const patch = values =>
    change({ ...d, elements: d.elements.map(e => (e.id === element.id ? { ...e, ...values } : e)) })
  const move = (x, y) => {
    if (!readOnly && !receipt) change(moverElemento(d, element.id, x, y))
  }
  return (
    <div className="space-y-5 min-w-0">
      <FormField label="Nombre de la plantilla">
        <Input
          aria-label="Nombre de la plantilla"
          className="min-h-11"
          maxLength={80}
          value={draft.name}
          disabled={readOnly}
          onChange={e => onChange({ ...draft, name: e.target.value })}
        />
      </FormField>
      <FormField label="Propuesta de equipo y medio">
        <Select
          className="min-h-11"
          aria-label="Propuesta de equipo y medio"
          value={d.profile.deviceFamily}
          disabled={readOnly}
          onChange={e => change(aplicarPerfilPlantilla(d, e.target.value, kind))}
        >
          {PERFILES_IMPRESION.map(p => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </Select>
      </FormField>
      <p className="text-xs text-mute">
        Medidas en milímetros. Los medios Brother 25 × 90 y LTT214 110 × 60 son provisionales: medí
        tu rollo y calibrá sus desplazamientos. Cambiar equipo propone otra distribución.
      </p>
      <fieldset className="space-y-3">
        <legend className="font-semibold">Papel físico</legend>
        <div className="grid grid-cols-2 gap-3">
          {number('Ancho (mm)', d.page.widthMm, v => page('widthMm', v), { min: 5, max: 216 })}
          {number('Alto (mm)', d.page.heightMm, v => page('heightMm', v), { min: 10 })}
        </div>
        {receipt && (
          <Button
            className="min-h-11"
            variant="ghost"
            disabled={readOnly}
            onClick={() => page('heightMm', null)}
          >
            Usar alto continuo
          </Button>
        )}
        <FormField label="Orientación del contenido">
          <Select
            className="min-h-11"
            aria-label="Orientación del contenido"
            value={d.page.orientation}
            disabled={readOnly || receipt}
            onChange={e => page('orientation', Number(e.target.value))}
          >
            <option value={0}>Normal · no cambia el papel</option>
            <option value={90}>Girar contenido 90° · no cambia el papel</option>
          </Select>
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          {[
            ['top', 'superior'],
            ['right', 'derecho'],
            ['bottom', 'inferior'],
            ['left', 'izquierdo'],
          ].map(([key, label]) =>
            number(
              `Margen ${label} (mm)`,
              d.page.margins[key],
              v => page('margins', { ...d.page.margins, [key]: v }),
              { max: 40 },
            ),
          )}
        </div>
      </fieldset>
      <fieldset className="space-y-3">
        <legend className="font-semibold">Área imprimible y calibración</legend>
        <div className="grid grid-cols-2 gap-3">
          {[
            ['printableWidthMm', 'Ancho útil'],
            ['offsetXmm', 'Desplazamiento X'],
            ['offsetYmm', 'Desplazamiento Y'],
          ].map(([key, label]) =>
            number(`${label} (mm)`, d.profile[key], v =>
              change({ ...d, profile: { ...d.profile, [key]: v } }),
            ),
          )}
        </div>
        <p className="text-xs text-mute">
          DPI del perfil: {d.profile.dpi}. Salida de esta fase: PDF manual, sin enviar al agente.
        </p>
      </fieldset>
      <fieldset className="space-y-3">
        <legend className="font-semibold">Contenido y posición</legend>
        {kind === 'etiquetas-producto' && (
          <p className="text-xs text-mute">
            El QR opcional codifica el SKU completo, sin crear enlaces de acceso. Empresa usa el
            nombre disponible; no admite imágenes arbitrarias.
          </p>
        )}
        {receipt && (
          <p className="text-sm text-mute">
            El comprobante mantiene sus bloques premium, importes y QR en flujo. Esta fase permite
            papel, márgenes y tipografía de artículos; no permite ocultar ni mover bloques ni
            reemplaza aún el comprobante de Pedidos.
          </p>
        )}
        <FormField label="Elemento">
          <Select
            aria-label="Elemento"
            className="min-h-11"
            value={element.id}
            onChange={e => setSelected(e.target.value)}
          >
            {d.elements.map(e => (
              <option key={e.id} value={e.id}>
                {CONTENIDOS[e.binding]}
                {OBLIGATORIOS[kind].includes(e.binding) ? ' · obligatorio' : ''}
              </option>
            ))}
          </Select>
        </FormField>
        {!receipt && OPCIONALES[kind].some(b => !d.elements.some(e => e.binding === b)) && (
          <FormField label="Agregar contenido opcional">
            <Select
              className="min-h-11"
              aria-label="Agregar contenido opcional"
              value=""
              disabled={readOnly}
              onChange={e => {
                const binding = e.target.value
                if (!binding) return
                const y = Math.max(
                  ...d.elements.filter(e => e.visible).map(e => e.yMm + e.heightMm),
                )
                change({
                  ...d,
                  elements: [
                    ...d.elements,
                    {
                      id: binding,
                      binding,
                      type: tipoElemento(binding),
                      xMm: d.page.margins.left,
                      yMm: y,
                      widthMm:
                        binding === 'qr'
                          ? 16
                          : Math.min(
                              d.profile.printableWidthMm,
                              d.page.widthMm - d.page.margins.left - d.page.margins.right,
                            ),
                      heightMm: binding === 'qr' ? 16 : 6,
                      fontSizePt: 8,
                      alignment: 'left',
                      rotation: 0,
                      visible: true,
                    },
                  ],
                })
                setSelected(binding)
              }}
            >
              <option value="">Elegir contenido…</option>
              {OPCIONALES[kind]
                .filter(b => !d.elements.some(e => e.binding === b))
                .map(b => (
                  <option key={b} value={b}>
                    {CONTENIDOS[b]}
                  </option>
                ))}
            </Select>
          </FormField>
        )}
        {!receipt && (
          <>
            <div
              role="group"
              aria-label="Mover elemento con flechas"
              tabIndex={readOnly ? -1 : 0}
              className="rounded-xl border border-ink-600 p-2 focus-visible:outline-fono"
              onKeyDown={e => {
                const delta = {
                  ArrowLeft: [-1, 0],
                  ArrowRight: [1, 0],
                  ArrowUp: [0, -1],
                  ArrowDown: [0, 1],
                }[e.key]
                if (delta) {
                  e.preventDefault()
                  move(...delta.map(v => v * (e.shiftKey ? 5 : 1)))
                }
              }}
            >
              <p className="mb-2 text-xs text-mute">Flechas: 1 mm · Mayús + flecha: 5 mm.</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  ['Izquierda', -1, 0],
                  ['Derecha', 1, 0],
                  ['Arriba', 0, -1],
                  ['Abajo', 0, 1],
                ].map(([label, x, y]) => (
                  <Button
                    key={label}
                    className="min-h-11"
                    variant="ghost"
                    disabled={readOnly}
                    onClick={() => move(x, y)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                ['xMm', 'Posición X'],
                ['yMm', 'Posición Y'],
                ['widthMm', 'Ancho del elemento'],
                ['heightMm', 'Alto del elemento'],
              ].map(([key, label]) =>
                number(`${label} (mm)`, element[key], v => patch({ [key]: v })),
              )}
            </div>
          </>
        )}
        {number('Tamaño de letra (pt)', element.fontSizePt, v => patch({ fontSizePt: v }), {
          min: 6,
          max: 48,
          disabled: receipt && element.binding !== 'items',
        })}
        {!receipt && (
          <>
            <FormField label="Alineación">
              <Select
                className="min-h-11"
                aria-label="Alineación"
                disabled={readOnly}
                value={element.alignment}
                onChange={e => patch({ alignment: e.target.value })}
              >
                <option value="left">Izquierda</option>
                <option value="center">Centro</option>
                <option value="right">Derecha</option>
              </Select>
            </FormField>
            <FormField label="Rotación del elemento">
              <Select
                className="min-h-11"
                aria-label="Rotación del elemento"
                disabled={readOnly}
                value={element.rotation}
                onChange={e => patch({ rotation: Number(e.target.value) })}
              >
                {[0, 90, 180, 270].map(v => (
                  <option key={v} value={v}>
                    {v}°
                  </option>
                ))}
              </Select>
            </FormField>
            <p className="text-xs text-mute">
              La caja conserva su tamaño físico final al girar el contenido. Ajustá sus medidas si
              no cabe.
            </p>
            {!OBLIGATORIOS[kind].includes(element.binding) && (
              <Button
                className="min-h-11"
                variant="ghost"
                disabled={readOnly}
                onClick={() => patch({ visible: !element.visible })}
              >
                {element.visible ? 'Ocultar' : 'Mostrar'} {CONTENIDOS[element.binding]}
              </Button>
            )}
          </>
        )}
      </fieldset>
    </div>
  )
}
