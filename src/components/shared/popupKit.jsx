import { Children, cloneElement, isValidElement, useContext, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui'
import { cn } from '@/lib/utils'
import Popup, { ContextoPopup } from './Popup'
import PopupConfirmar from './PopupConfirmar'

// Puente al Popup ÚNICO (docs/PLANTILLA-OBJETOS.md, sección Popup): mismos
// nombres y props que `Modal`, `ConfirmDialog`, `SaveActions`, `FormActions` y
// `useDialog*` de la biblioteca, pero montados sobre `Popup` (hoja en móvil,
// centrado en escritorio, X roja de 44 px, Esc, foco y confirmación al cerrar
// con cambios). Cada pantalla cambia solo el import; su lógica no se toca.

const TAMANOS = { corto: 'sm', formulario: 'md', amplio: 'lg', completo: 'xl' }

export function Modal({ open = true, onClose, title, children, className, size = 'formulario', busy = false, dirty = false, descarte, accion, testId }) {
  return (
    <Popup open={open} onClose={onClose} title={title} tamano={TAMANOS[size] || size} className={className} busy={busy} dirty={dirty} descarte={descarte} accion={accion} testId={testId}>
      {children}
    </Popup>
  )
}

export function ConfirmDialog({ variant, ...props }) {
  return <PopupConfirmar variant={variant === 'danger' ? 'danger' : 'primary'} {...props} />
}

export function useDialogClose() {
  return useContext(ContextoPopup)?.requestClose
}

export function useDialogPending(pendiente) {
  const contexto = useContext(ContextoPopup)
  const id = useRef(Symbol('formulario')).current
  const registrar = contexto?.registrar
  useLayoutEffect(() => {
    registrar?.(id, Boolean(pendiente))
    return () => registrar?.(id, false)
  }, [registrar, id, pendiente])
}

export function useDialogDirty(hayCambios) {
  const contexto = useContext(ContextoPopup)
  const id = useRef(Symbol('cambios')).current
  const registrar = contexto?.registrarCambios
  useLayoutEffect(() => {
    registrar?.(id, Boolean(hayCambios))
    return () => registrar?.(id, false)
  }, [registrar, id, hayCambios])
}

export function conFormulario(children, formId) {
  return Children.map(children, hijo => (
    isValidElement(hijo) && !hijo.props?.form && (hijo.type === 'button' || typeof hijo.type === 'function')
      ? cloneElement(hijo, { form: formId || undefined })
      : hijo
  ))
}

// Acciones del formulario: dentro de un Popup se dibujan en su pie fijo y
// quedan asociadas al `<form>` que las declara; fuera, quedan en línea.
export function FormActions({ children, className }) {
  const contexto = useContext(ContextoPopup)
  const ancla = useRef(null)
  const id = useId()
  const [formId, setFormId] = useState('')
  const pie = contexto?.pie || null
  useLayoutEffect(() => {
    const formulario = ancla.current?.closest('form')
    if (!formulario) { setFormId(''); return }
    if (!formulario.id) formulario.id = id
    setFormId(formulario.id)
  }, [id, pie])
  const acciones = (
    <div className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}>{conFormulario(children, formId)}</div>
  )
  return (
    <>
      <span hidden ref={ancla} />
      {pie ? createPortal(acciones, pie) : acciones}
    </>
  )
}

export function SaveActions({ pendiente = false, children, cancelLabel = 'Cancelar', className }) {
  const requestClose = useDialogClose()
  useDialogPending(pendiente)
  return (
    <FormActions className={className}>
      {requestClose && cancelLabel ? (
        <Button type="button" variant="ghost" disabled={pendiente} onClick={() => { if (!pendiente) requestClose() }}>{cancelLabel}</Button>
      ) : null}
      {children}
    </FormActions>
  )
}
