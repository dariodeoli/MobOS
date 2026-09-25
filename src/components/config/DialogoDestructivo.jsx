// Confirmación destructiva con palabra exacta (y contraseña de empresa cuando
// hace falta). Nació dentro de Config.jsx; con el reparto de #253 se movió a su
// archivo para que lo compartan el grupo Organización (abandonar tienda) y la
// sección de Seguridad (cerrar cuenta / eliminar empresa) sin duplicar el flujo.
import { useEffect, useState } from 'react'
import { Aviso, Button, Input, Label, Modal, PasswordInput } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import { PIE_ACCIONES_REVERSO } from '@/components/shared/formulario'

export default function DialogoDestructivo({ open, title, description, palabra, necesitaClave = false, confirmLabel, busy, error, onCancel, onConfirm }) {
  const [palabraActual, setPalabraActual] = useState('')
  const [clave, setClave] = useState('')
  useEffect(() => { if (open) { setPalabraActual(''); setClave('') } }, [open])
  const lista = palabraActual.trim() === palabra && (!necesitaClave || clave)
  return (
    <Modal open={open} onClose={busy ? undefined : onCancel} title={title} size="corto">
      <div className="space-y-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-bad/10 text-bad"><Icon name="alert" className="h-5 w-5" /></div>
        <p className="text-sm leading-6 text-mute">{description}</p>
        {necesitaClave && (
          <div>
            <Label htmlFor="dialogo-clave">Contraseña de la empresa</Label>
            <PasswordInput id="dialogo-clave" autoFocus disabled={busy} value={clave} onChange={(event) => setClave(event.target.value)} placeholder="Para verificar tu identidad" autoComplete="current-password" />
          </div>
        )}
        <div>
          <Label htmlFor="dialogo-palabra">Escribí {palabra} para confirmar</Label>
          <Input id="dialogo-palabra" autoFocus={!necesitaClave} disabled={busy} value={palabraActual} onChange={(event) => setPalabraActual(event.target.value)} placeholder={palabra} />
        </div>
        {error && <Aviso tono="error">{error}</Aviso>}
        <div className={PIE_ACCIONES_REVERSO}>
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>Cancelar</Button>
          <Button type="button" variant="danger" onClick={() => onConfirm(necesitaClave ? { password: clave } : {})} disabled={busy || !lista}>{busy ? 'Procesando…' : confirmLabel}</Button>
        </div>
      </div>
    </Modal>
  )
}
