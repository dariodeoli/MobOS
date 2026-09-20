import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api/client'
import { Button, Card, ConfirmDialog, EmptyState, Select, Badge, Skeleton, useToast } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import PercentField, { formatPercent, parsePercent } from '@/components/shared/PercentField'

// Reglas de comisión sobre el margen (Finanzas → Comisiones). Mismo contrato
// que Configuración → Equipo usaba: endpoints /api/commission-rules, solo
// ADMIN las gestiona y la regla por usuario prevalece sobre la de rol.
export default function Comisiones() {
  const toast = useToast()
  const [reglas, setReglas] = useState(null)
  const [usuarios, setUsuarios] = useState([])
  const [nueva, setNueva] = useState({ userId: '', percentPyg: '' })
  const [editandoId, setEditandoId] = useState(null)
  const [borrador, setBorrador] = useState('')
  const [eliminando, setEliminando] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')

  const cargar = useCallback(async () => {
    setError('')
    try {
      const [nextReglas, nextUsuarios] = await Promise.all([api.get('/api/commission-rules'), api.get('/api/users')])
      setReglas(nextReglas || [])
      setUsuarios(nextUsuarios || [])
    } catch (cause) { setError(cause?.message || 'No se pudieron cargar las reglas de comisión.') }
  }, [])
  useEffect(() => { cargar() }, [cargar])

  async function crear(event) {
    event.preventDefault()
    if (!nueva.userId || ocupado) return
    setOcupado(true); setError('')
    try {
      await api.post('/api/commission-rules', { userId: nueva.userId, percentPyg: parsePercent(nueva.percentPyg) })
      setNueva({ userId: '', percentPyg: '' })
      toast.success('Regla de comisión creada.')
      await cargar()
    } catch (cause) { setError(cause?.message || 'No se pudo crear la regla.') } finally { setOcupado(false) }
  }

  async function guardar(regla) {
    const percent = parsePercent(borrador)
    if (percent === null || percent < 0 || percent > 100) { setError('El porcentaje debe estar entre 0 y 100.'); return }
    setOcupado(true); setError('')
    try {
      await api.patch('/api/commission-rules', { id: regla.id, percentPyg: percent })
      setEditandoId(null)
      toast.success('Regla de comisión actualizada.')
      await cargar()
    } catch (cause) { setError(cause?.message || 'No se pudo actualizar la regla.') } finally { setOcupado(false) }
  }

  async function confirmarEliminar() {
    setOcupado(true); setError('')
    try {
      await api.delete('/api/commission-rules', { body: { id: eliminando.id } })
      setEliminando(null)
      toast.success('Regla de comisión eliminada.')
      await cargar()
    } catch (cause) { setError(cause?.message || 'No se pudo eliminar la regla.') } finally { setOcupado(false) }
  }

  const nombreUsuario = id => usuarios.find(usuario => usuario.id === id)?.name || 'Usuario eliminado'

  return (
    <Card>
      <h2 className="font-bold mb-1">Comisiones</h2>
      <p className="text-sm text-mute mb-4">
        Reglas de comisión sobre el <strong>margen</strong> de cada venta. La regla por usuario prevalece sobre la de rol.
      </p>
      <form onSubmit={crear} className="flex flex-col gap-3 mb-4 sm:flex-row sm:items-end">
        <div className="flex-1">
          <span className="block text-[10px] font-bold uppercase text-mute mb-1">Vendedor</span>
          <Select aria-label="Vendedor de la regla" value={nueva.userId} onChange={event => setNueva({ ...nueva, userId: event.target.value })} required>
            <option value="">Elegí el vendedor</option>
            {usuarios.map(usuario => <option key={usuario.id} value={usuario.id}>{usuario.name} · {usuario.role}</option>)}
          </Select>
        </div>
        <div className="sm:w-36">
          <span className="block text-[10px] font-bold uppercase text-mute mb-1">% comisión</span>
          <PercentField aria-label="Porcentaje de comisión" value={nueva.percentPyg} onChange={value => setNueva({ ...nueva, percentPyg: value })} placeholder="0" required />
        </div>
        <Button type="submit" disabled={ocupado}>{ocupado ? 'Guardando…' : 'Agregar regla'}</Button>
      </form>
      {error && <p role="alert" className="mb-4 rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
      {reglas === null ? (
        <div className="space-y-2" aria-busy="true"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>
      ) : reglas.length === 0 ? (
        <EmptyState compact icon="tag" title="Sin reglas de comisión." description="Agregá una regla para empezar a calcular comisiones por margen." />
      ) : (
        <div className="space-y-2">
          {reglas.map(regla => (
            <div key={regla.id} data-testid="regla-comision" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-600 p-2.5">
              <div className="min-w-0">
                <div className="truncate text-[13px] font-semibold">{regla.userId ? (regla.user?.name || nombreUsuario(regla.userId)) : `Rol ${regla.role}`}</div>
                <div className="mt-0.5 text-xs text-mute">{regla.userId ? 'Regla por usuario' : 'Regla por rol'}</div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {editandoId === regla.id ? (
                  <>
                    <PercentField className="h-8 w-20 px-2 text-right text-sm" aria-label="Porcentaje de comisión" value={borrador} onChange={setBorrador} />
                    <Button type="button" variant="success" disabled={ocupado} className="h-8 px-2 text-xs" onClick={() => guardar(regla)}>Guardar</Button>
                    <Button type="button" variant="ghost" className="h-8 px-2 text-xs" onClick={() => setEditandoId(null)}>Cancelar</Button>
                  </>
                ) : (
                  <>
                    <Badge color="green">{formatPercent(regla.percentPyg)}%</Badge>
                    <button type="button" onClick={() => { setEditandoId(regla.id); setBorrador(formatPercent(regla.percentPyg)) }} className="text-mute hover:text-fore transition" title="Editar porcentaje"><Icon name="edit" className="h-4 w-4" /></button>
                    <button type="button" onClick={() => setEliminando(regla)} className="text-mute hover:text-bad transition" title="Eliminar regla"><Icon name="trash" className="h-4 w-4" /></button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <ConfirmDialog
        open={Boolean(eliminando)}
        onCancel={() => setEliminando(null)}
        onConfirm={confirmarEliminar}
        busy={ocupado}
        title="¿Eliminar regla?"
        description="La regla dejará de aplicarse al calcular comisiones. Las ventas ya calculadas no cambian."
        confirmLabel="Eliminar regla"
        variant="danger"
      />
    </Card>
  )
}
