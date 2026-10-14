import { useState } from 'react'
import Icon from '@/components/shared/Icon'
import { ROTULO_SECCION } from '@/components/shared/tabla'
import { cn } from '@/lib/utils'

// Piezas de la ficha de unidad (#400, unidad I). Estructura tipo Shopify:
// tarjetas con rótulo, valores en grilla densa y edición en línea por campo
// (lápiz → editor → ✓ / ×). La ficha las compone; acá no hay datos del negocio.

/** Tarjeta de la ficha: rótulo en versalitas y contenido. */
export function TarjetaFicha({ titulo, accion, className, children, ...resto }) {
  return (
    <section className={cn('rounded-2xl border border-ink-600 p-4', className)} {...resto}>
      {(titulo || accion) && (
        <div className="mb-3 flex min-h-6 flex-wrap items-center justify-between gap-2">
          {titulo ? <h3 className={ROTULO_SECCION}>{titulo}</h3> : <span />}
          {accion}
        </div>
      )}
      {children}
    </section>
  )
}

/**
 * Campo de la ficha con edición en línea. Muestra rótulo + valor; con permiso
 * aparece el lápiz y el editor reemplaza al valor (un solo control por estado).
 * `onGuardar` es async: si no lanza, el editor se cierra; si lanza, queda abierto.
 */
export function CampoFicha({ etiqueta, children, editor, onAbrir, onGuardar, puedeEditar = false, guardando = false, ancho = false, ayuda, className, testId }) {
  const [editando, setEditando] = useState(false)
  const abrir = () => { onAbrir?.(); setEditando(true) }
  const guardar = async () => {
    try { await onGuardar?.(); setEditando(false) } catch { /* el aviso ya lo muestra quien guarda; el editor queda abierto */ }
  }
  return (
    <div className={cn('min-w-0', (ancho || editando) && 'col-span-full', className)} data-testid={testId} title={ayuda}>
      <div className="flex items-center gap-1">
        <p className="text-xs text-mute">{etiqueta}</p>
        {puedeEditar && !editando && (
          <button type="button" onClick={abrir} aria-label={`Editar ${etiqueta.toLowerCase()}`} title={`Editar ${etiqueta.toLowerCase()}`} className="toque-44 -my-1 rounded-md p-1 text-mute transition hover:bg-fore/5 hover:text-fore">
            <Icon name="edit" className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {editando ? (
        <div className="mt-1 space-y-2">
          {editor}
          <div className="flex items-center gap-1">
            <button type="button" disabled={guardando} onClick={guardar} aria-label={`Guardar ${etiqueta.toLowerCase()}`} data-testid={testId ? `${testId}-guardar` : undefined} className="toque-44 inline-flex items-center gap-1 rounded-lg border border-fono/40 px-2.5 py-1 text-xs font-semibold text-fono-light transition hover:bg-fono/10 disabled:opacity-50">
              <Icon name="check" className="h-3.5 w-3.5" />{guardando ? 'Guardando…' : 'Guardar'}
            </button>
            <button type="button" disabled={guardando} onClick={() => setEditando(false)} aria-label={`Cancelar edición de ${etiqueta.toLowerCase()}`} className="toque-44 inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs text-mute transition hover:bg-fore/5 hover:text-fore">
              <Icon name="close" className="h-3.5 w-3.5" />Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-0.5 text-sm font-semibold">{children}</div>
      )}
    </div>
  )
}

const TONOS_PROVEEDOR = ['#2563eb', '#7c3aed', '#0d9488', '#c2410c', '#be185d', '#4d7c0f', '#0369a1', '#a16207']

// Color estable por sigla cuando el proveedor todavía no eligió uno.
function colorPorDefecto(sigla = '') {
  let suma = 0
  for (const caracter of String(sigla)) suma += caracter.charCodeAt(0)
  return TONOS_PROVEEDOR[suma % TONOS_PROVEEDOR.length]
}

// Insignia local del proveedor (monograma con color + sigla). La planilla de
// Unidades tendrá su `ProveedorBadge` compartido: cuando exista, esta pieza se
// reemplaza por esa (#400, handoff de unificación).
export function InsigniaProveedor({ sigla, color, nombre, className }) {
  const texto = String(sigla || 'S/S')
  const fondo = /^#[0-9a-f]{6}$/i.test(color || '') ? color : colorPorDefecto(texto)
  return (
    <span className={cn('inline-flex max-w-full items-center gap-1.5 align-middle', className)} data-testid="proveedor-insignia">
      <span aria-hidden="true" className="inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-md px-1 text-[10px] font-bold uppercase leading-none text-white" style={{ backgroundColor: fondo }}>{texto.slice(0, 2)}</span>
      <span className="truncate font-mono text-xs font-semibold" title={nombre || undefined}>{texto}</span>
    </span>
  )
}
