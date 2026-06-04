import { useState } from 'react'
import { getVendedores, addVendedor, updateVendedor, deleteVendedor, listVentas, productosById } from '@/lib/storage'
import { totalesVendedor, ventasDelDia, comisionDeVentas, fechaClave, num, gs } from '@/utils/calculos'
import { Card, Button, Input, Badge } from '@/components/ui'

export default function Vendedores() {
  const vendedores = getVendedores()
  const ventas = listVentas()
  const prods = productosById()
  const [nuevo, setNuevo] = useState('')

  function crear(e) {
    e.preventDefault()
    const nombre = nuevo.trim()
    if (!nombre) return
    addVendedor(nombre)
    setNuevo('')
  }

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="font-bold mb-1">🧑‍💼 Funcionarios y metas</h2>
        <p className="text-sm text-slate-500 mb-4">
          Fijá la <strong>meta diaria</strong> de cada vendedor y agregá nuevos cuando
          contrates. La meta se guarda al salir del campo.
        </p>
        <form onSubmit={crear} className="flex gap-2 mb-4">
          <Input
            value={nuevo}
            onChange={(e) => setNuevo(e.target.value)}
            placeholder="Nombre del nuevo vendedor"
            autoCapitalize="words"
          />
          <Button type="submit">➕ Agregar</Button>
        </form>

        <div className="space-y-2.5">
          {vendedores.map((v) => {
            const t = totalesVendedor(ventas, v.id)
            const com = comisionDeVentas(ventasDelDia(ventas, fechaClave(), v.id), prods)
            return (
              <div key={v.id} className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <input
                    defaultValue={v.nombre}
                    onBlur={(e) => updateVendedor(v.id, { nombre: e.target.value.trim() || v.nombre })}
                    className="font-bold text-sm bg-transparent outline-none border-b border-transparent focus:border-fono"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => updateVendedor(v.id, { activo: !v.activo })}
                      className="text-xs"
                      title={v.activo ? 'Desactivar' : 'Activar'}
                    >
                      {v.activo ? <Badge color="green">Activo</Badge> : <Badge color="slate">Inactivo</Badge>}
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`¿Eliminar a "${v.nombre}"? Las ventas que ya cargó se mantienen.`))
                          deleteVendedor(v.id)
                      }}
                      className="text-slate-300 hover:text-bad text-sm transition"
                      title="Eliminar vendedor"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
                  <label className="block col-span-2 md:col-span-1">
                    <span className="text-[10px] font-bold uppercase text-slate-400">Meta diaria ₲</span>
                    <Input
                      inputMode="numeric"
                      defaultValue={v.metaDiaria || ''}
                      onBlur={(e) => updateVendedor(v.id, { metaDiaria: num(e.target.value) })}
                      placeholder="0"
                    />
                  </label>
                  <Mini label="Hoy" valor={t.hoy} />
                  <Mini label="Comisión hoy" valor={com} />
                  <Mini label="Mes" valor={t.mes} />
                </div>
              </div>
            )
          })}
        </div>
      </Card>
    </div>
  )
}

function Mini({ label, valor }) {
  return (
    <div className="text-center rounded-lg bg-slate-50 py-2">
      <div className="text-[10px] font-bold uppercase text-slate-400">{label}</div>
      <div className="text-sm font-bold text-fono">{gs(valor)}</div>
    </div>
  )
}
