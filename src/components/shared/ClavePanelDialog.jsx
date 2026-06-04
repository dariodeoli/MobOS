import { useState } from 'react'
import { verificarClavePanel } from '@/lib/storage'
import { Button, Card, Input, Label } from '@/components/ui'

export default function ClavePanelDialog({ onOk, onCancel }) {
  const [clave, setClave] = useState('')
  const [error, setError] = useState(false)

  function intentar(e) {
    e.preventDefault()
    if (verificarClavePanel(clave)) {
      onOk()
    } else {
      setError(true)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onCancel}
    >
      <Card className="w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="text-center text-4xl mb-2">🔐</div>
        <h2 className="text-center font-extrabold text-lg">Centro de Control</h2>
        <p className="text-center text-sm text-slate-500 mb-4">
          Esta área es solo para el propietario.
        </p>
        <form onSubmit={intentar}>
          <Label>Contraseña</Label>
          <Input
            type="password"
            autoFocus
            value={clave}
            onChange={(e) => {
              setClave(e.target.value)
              setError(false)
            }}
            placeholder="Ingresá la contraseña"
          />
          {error && (
            <p className="text-bad text-sm font-semibold mt-2">
              ❌ Contraseña incorrecta
            </p>
          )}
          <div className="flex gap-2 mt-4">
            <Button type="button" variant="ghost" className="flex-1" onClick={onCancel}>
              Cancelar
            </Button>
            <Button type="submit" className="flex-1">
              Ingresar →
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
