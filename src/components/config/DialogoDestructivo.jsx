// Confirmación destructiva con palabra exacta (y contraseña de empresa cuando
// hace falta). Nació dentro de Config.jsx; con el reparto de #253 se movió a su
// archivo para que lo compartan el grupo Organización (abandonar tienda) y la
// sección de Seguridad (cerrar cuenta / eliminar empresa) sin duplicar el flujo.
//
// #323: adopta el estándar — cierre con confirmación si hay algo escrito
// (`dirty`), error junto al campo de la palabra (y no un aviso suelto) y pie
// `SaveActions` con un solo primario destructivo.
import { useEffect, useState } from 'react'
import { Aviso, Button, FormField, Input, Modal, PasswordInput, SaveActions } from '@/components/ui'
import Icon from '@/components/shared/Icon'

export default function DialogoDestructivo({ open, title, description, palabra, necesitaClave = false, confirmLabel, busy, error, onCancel, onConfirm }) {
  const [palabraActual, setPalabraActual] = useState('')
  const [clave, setClave] = useState('')
  const [tocado, setTocado] = useState(false)
  useEffect(() => { if (open) { setPalabraActual(''); setClave(''); setTocado(false) } }, [open])
  const coincide = palabraActual.trim() === palabra
  const lista = coincide && (!necesitaClave || clave)
  const errorPalabra = (tocado || palabraActual) && !coincide ? `Escribí exactamente ${palabra}.` : ''
  return (
    <Modal open={open} onClose={onCancel} title={title} size="corto" dirty={Boolean(palabraActual || clave)} busy={busy}>
      <div className="space-y-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-bad/10 text-bad"><Icon name="alert" className="h-5 w-5" /></div>
        <p className="text-sm leading-6 text-mute">{description}</p>
        {necesitaClave && (
          <FormField label="Contraseña de la empresa" htmlFor="dialogo-clave">
            <PasswordInput id="dialogo-clave" autoFocus disabled={busy} value={clave} onChange={(event) => setClave(event.target.value)} placeholder="Para verificar tu identidad" autoComplete="current-password" />
          </FormField>
        )}
        <FormField label={`Escribí ${palabra} para confirmar`} htmlFor="dialogo-palabra" error={errorPalabra}>
          <Input
            id="dialogo-palabra"
            autoFocus={!necesitaClave}
            disabled={busy}
            value={palabraActual}
            onChange={(event) => setPalabraActual(event.target.value)}
            onBlur={() => setTocado(true)}
            placeholder={palabra}
            aria-invalid={Boolean(errorPalabra) || undefined}
          />
        </FormField>
        {error && <Aviso tono="error">{error}</Aviso>}
        <SaveActions pendiente={busy}>
          <Button type="button" variant="danger" onClick={() => onConfirm(necesitaClave ? { password: clave } : {})} disabled={busy || !lista}>{busy ? 'Procesando…' : confirmLabel}</Button>
        </SaveActions>
      </div>
    </Modal>
  )
}
