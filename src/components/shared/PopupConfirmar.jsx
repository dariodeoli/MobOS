import Popup from './Popup'

// Confirmación sobre el Popup único: misma API que el `ConfirmDialog` de la
// biblioteca (open/onCancel/onConfirm/title/description/confirmLabel/variant/
// busy) para migrar sin tocar la lógica de cada pantalla.
export default function PopupConfirmar({
  open = true,
  onCancel,
  onConfirm,
  title = 'Confirmar acción',
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'primary',
  busy = false,
  testId,
}) {
  const principal = { label: busy ? 'Procesando…' : confirmLabel, onClick: onConfirm, disabled: busy }
  return (
    <Popup
      open={open}
      tipo="confirmar"
      title={title}
      description={description}
      onClose={onCancel}
      busy={busy}
      testId={testId}
      acciones={{
        secundaria: { label: cancelLabel, onClick: onCancel, disabled: busy },
        ...(variant === 'danger' ? { peligro: principal } : { primaria: principal }),
      }}
    />
  )
}
