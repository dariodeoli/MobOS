import { useState } from 'react'
import { cambiarClavePanel } from '@/lib/storage'
import { Card, Button, Input, Label } from '@/components/ui'

export default function Config() {
  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [conf, setConf] = useState('')
  const [msg, setMsg] = useState(null)

  function cambiar(e) {
    e.preventDefault()
    if (nueva.length < 4) return setMsg({ tipo: 'err', txt: 'La nueva clave debe tener al menos 4 caracteres.' })
    if (nueva !== conf) return setMsg({ tipo: 'err', txt: 'Las contraseñas nuevas no coinciden.' })
    if (!cambiarClavePanel(actual, nueva)) return setMsg({ tipo: 'err', txt: '❌ La contraseña actual es incorrecta.' })
    setActual(''); setNueva(''); setConf('')
    setMsg({ tipo: 'ok', txt: '✅ Contraseña actualizada correctamente.' })
  }

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="font-bold mb-3">🔒 Cambiar contraseña del Centro de Control</h2>
        <form onSubmit={cambiar} className="space-y-3 max-w-md">
          <div>
            <Label>Contraseña actual</Label>
            <Input type="password" value={actual} onChange={(e) => setActual(e.target.value)} />
          </div>
          <div>
            <Label>Nueva contraseña</Label>
            <Input type="password" value={nueva} onChange={(e) => setNueva(e.target.value)} placeholder="Mínimo 4 caracteres" />
          </div>
          <div>
            <Label>Repetir nueva contraseña</Label>
            <Input type="password" value={conf} onChange={(e) => setConf(e.target.value)} />
          </div>
          {msg && (
            <p className={'text-sm font-semibold ' + (msg.tipo === 'ok' ? 'text-ok' : 'text-bad')}>
              {msg.txt}
            </p>
          )}
          <Button type="submit">Cambiar contraseña</Button>
        </form>
      </Card>

      <Card className="bg-fono-light border-fono/20">
        <h3 className="font-bold mb-1">🌐 Tiempo real entre celulares</h3>
        <p className="text-sm text-slate-600">
          Hoy los datos se guardan en este dispositivo. Para que cada vendedor cargue
          desde su propio celular y veas todo en vivo, hay que conectar <strong>Supabase</strong>{' '}
          (gratis). Avisá cuando quieras y lo activamos — solo se reescribe la capa de
          datos, el resto de la app queda igual.
        </p>
      </Card>
    </div>
  )
}
