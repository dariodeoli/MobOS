import { useState } from 'react'
import { listGastos, addGasto, deleteGasto, CATEGORIAS_GASTO } from '@/lib/storage'
import { fechaClave, num, gs } from '@/utils/calculos'
import { Card, Button, Input, Label, Select, Badge } from '@/components/ui'
import Icon from '@/components/shared/Icon'

const VACIO = () => ({
  monto: '',
  motivo: '',
  fecha: fechaClave(),
  categoria: 'Otros',
})

export default function Gastos() {
  const gastos = listGastos()
  const [f, setF] = useState(VACIO)
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))

  function guardar(e) {
    e.preventDefault()
    if (num(f.monto) <= 0 || !f.motivo.trim()) return
    addGasto({ ...f, monto: num(f.monto) })
    setF(VACIO())
  }

  const total = gastos.reduce((a, g) => a + num(g.monto), 0)

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="font-bold mb-3">Registrar gasto</h2>
        <form onSubmit={guardar} className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label>Monto ₲</Label>
            <Input
              inputMode="numeric"
              value={f.monto}
              onChange={set('monto')}
              placeholder="Ej: 250000"
            />
          </div>
          <div>
            <Label>Fecha</Label>
            <Input type="date" value={f.fecha} onChange={set('fecha')} />
          </div>
          <div className="md:col-span-2">
            <Label>Motivo</Label>
            <Input
              value={f.motivo}
              onChange={set('motivo')}
              placeholder="Ej: Compra de mercadería, alquiler…"
              autoCapitalize="sentences"
            />
          </div>
          <div>
            <Label>Categoría</Label>
            <Select value={f.categoria} onChange={set('categoria')}>
              {CATEGORIAS_GASTO.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex items-end">
            <Button type="submit" className="w-full">
              Guardar gasto
            </Button>
          </div>
        </form>
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-ink-600">
          <h3 className="font-bold">Historial de gastos</h3>
          <Badge color="red">Total: {gs(total)}</Badge>
        </div>
        {gastos.length === 0 ? (
          <div className="p-8 text-center text-mute text-sm">Sin gastos registrados.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
            {gastos.map((g) => (
              <div key={g.id} className="rounded-xl border border-ink-600 p-3 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-1">
                  <div className="font-semibold text-sm min-w-0 truncate">{g.motivo}</div>
                  <button
                    onClick={() => deleteGasto(g.id)}
                    className="text-mute hover:text-bad p-1 shrink-0"
                    title="Eliminar"
                  >
                    <Icon name="trash" className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs text-mute flex items-center gap-1.5">
                    {g.fecha} <Badge color="slate">{g.categoria}</Badge>
                  </div>
                  <span className="font-bold text-bad text-sm shrink-0">{gs(g.monto)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
