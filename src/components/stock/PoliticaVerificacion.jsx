import { useLayoutEffect, useRef, useState } from 'react'
import { Button, useToast } from '@/components/ui'
import { api } from '@/lib/api/client'
import { useSesion } from '@/lib/sesion'

const ROLES = [['ADMIN', 'Administración'], ['GERENTE', 'Gerencia'], ['VENDEDOR', 'Ventas'], ['CAJERA', 'Caja'], ['TECNICO', 'Taller'], ['REPARTIDOR', 'Reparto']]
const DATOS = [['condition', 'Condición del equipo'], ['battery', 'Batería y ciclos de carga'], ['notes', 'Nota del equipo']]
const INICIAL = { roles: ROLES.map(([id]) => id), records: [] }

/** Política de empresa: nunca se escribe en preferencias personales. */
export default function PoliticaVerificacion() {
  const { empresa, usuario, sesion, esDemo } = useSesion()
  const scope = JSON.stringify([empresa?.id, usuario?.id, sesion?.vendedorId, esDemo])
  const generation = useRef(0)
  const [state, setState] = useState(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const toast = useToast()
  useLayoutEffect(() => {
    const id = ++generation.current
    setState(null); setError(''); setSaving(false)
    if (esDemo) setState({ policy: INICIAL, canConfigure: false })
    else api.get('/api/tenant/stock-verification').then(data => {
      if (generation.current === id) setState(data)
    }).catch(cause => { if (generation.current === id) setError(cause?.message || 'No se pudo leer la configuración.') })
    return () => { generation.current = id + 1 }
  }, [scope, esDemo])
  const toggle = (key, id) => setState(current => ({ ...current, policy: { ...current.policy, [key]: current.policy[key].includes(id) ? current.policy[key].filter(value => value !== id) : [...current.policy[key], id] } }))
  async function save() {
    const id = generation.current
    setSaving(true); setError('')
    try {
      const data = await api.put('/api/tenant/stock-verification', state.policy)
      if (generation.current !== id) return
      setState(data); toast.success('Configuración de verificación guardada para la empresa.')
    } catch (cause) {
      if (generation.current === id) setError(cause?.message || 'No se pudo guardar la configuración.')
    } finally { if (generation.current === id) setSaving(false) }
  }
  return <section className="space-y-2 rounded-lg border border-ink-600 p-3" data-testid="planilla-pref-verificacion">
    <h3 className="text-sm font-semibold">Verificación de stock</h3>
    <p className="text-xs text-mute">Cada verificación guarda siempre quién la hizo, fecha, hora e historial. Solo el dueño configura quién verifica y los datos adicionales que quedan como foto del equipo.</p>
    {error ? <p role="alert" className="text-xs text-bad">{error}</p> : null}
    {!state && !error ? <p role="status" className="text-xs text-mute">Cargando configuración…</p> : null}
    {state ? <>
      {[['roles', 'Quién puede verificar', ROLES], ['records', 'Datos adicionales del registro', DATOS]].map(([key, title, options]) => <fieldset key={key} disabled={!state.canConfigure || saving} className="space-y-1">
        <legend className="text-xs font-semibold">{title}</legend>
        {options.map(([id, label]) => <label key={id} className="flex min-h-11 items-center gap-2 text-xs">
          <input type="checkbox" className="h-4 min-h-0 w-4 accent-fono" checked={state.policy[key].includes(id)} onChange={() => toggle(key, id)} />{label}
        </label>)}
      </fieldset>)}
      {state.canConfigure ? <Button type="button" disabled={saving} onClick={save} className="min-h-11">{saving ? 'Guardando…' : 'Guardar verificación de empresa'}</Button> : <p className="text-xs text-mute">{esDemo ? 'En la demo se muestra la política inicial. El dueño la configura en su empresa.' : 'Solo el dueño puede cambiar esta configuración.'}</p>}
    </> : null}
  </section>
}
