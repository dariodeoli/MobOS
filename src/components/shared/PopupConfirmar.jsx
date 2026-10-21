import Popup from './Popup'

// Confirmación sobre el Popup único: misma firma que el `ConfirmDialog`
// histórico (open, onCancel, onConfirm, title, description, confirmLabel,
// cancelLabel, variant, busy) para migrar pantallas sin tocar su lógica.
export default function PopupConfirmar({
  open,
  onCancel,
  onConfirm,
  title = 'Confirmar acción',
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'primary',
  busy = false,
}) {
  const confirmar = { label: busy ? 'Procesando…' : confirmLabel, onClick: onConfirm, disabled: busy }
  return (
    <Popup
      open={open}
      onClose={onCancel}
      busy={busy}
      tipo="confirmar"
      title={title}
      description={description}
      acciones={{
        secundaria: { label: cancelLabel, onClick: onCancel, disabled: busy },
        ...(variant === 'danger' ? { peligro: confirmar } : { primaria: confirmar }),
      }}
    />
  )
}
