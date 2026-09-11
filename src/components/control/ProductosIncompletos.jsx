import { useEffect, useMemo, useState } from 'react'
import {
  getProductos,
  updateProducto,
  listVentas,
  updateVenta,
  productosById,
  vendedoresById,
} from '@/lib/storage'
import { num, gs, fechaClave } from '@/utils/calculos'
import { Card, Button, Input, Badge } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import { cn } from '@/lib/utils'

// Los montos en guaraníes se escriben con puntos ("2.500"). num() los rompe
// (devolvería 2.5), así que acá siempre se leen solo los dígitos.
const gsNum = (v) => Number(String(v ?? '').replace(/[^\d]/g, '')) || 0

// El stock sí puede ser negativo (se vendió más de lo que figuraba), así que
// conserva el signo. Usar gsNum acá le daría vuelta el signo sin avisar.
const entNum = (v) => {
  const s = String(v ?? '').trim()
  const n = Number((s.startsWith('-') ? '-' : '') + s.replace(/[^\d]/g, ''))
  return Number.isFinite(n) ? n : 0
}

const parse = (campo, v) => (campo === 'stock' ? entNum(v) : gsNum(v))

// Comisión sugerida según la familia del producto, tomada de lo que ya se
// paga hoy en productos equivalentes. El ORDEN importa: "CASES TARJETERO
// CUERO" cae en CASE (₲2.500), no en TARJETERO. Para que un producto así
// pase a ₲3.000, subí 'TARJETERO' por encima de 'CASE'.
const FAMILIAS = [
  ['CASE', 2500],
  ['SKIN', 5000],
  ['PROTECTOR DE CAMARA', 3000],
  ['PROTECTOR', 3000],
  ['LAMINA', 3500],
  ['MAGIC GLASS', 2500],
  ['HIDROGEL', 2500],
  ['CABLE', 5000],
  ['CARGADOR', 5000],
  ['TARJETERO', 3000],
  ['STRAP', 3000],
  ['FUENTE', 5000],
  ['SELFIE', 3000],
  ['VENTOSA', 3000],
]
function sugerida(nombre) {
  const n = (nombre || '').toUpperCase()
  const hit = FAMILIAS.find(([k]) => n.includes(k))
  return hit ? hit[1] : 0
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const nombreMes = (m) => {
  const [y, mm] = (m || '').split('-')
  return mm ? `${MESES[Number(mm) - 1]} ${y}` : m
}
function mesesRecientes() {
  const hoy = new Date()
  return Array.from({ length: 3 }, (_, i) => {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
}

const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

const FILTROS = [
  ['comision', 'Sin comisión'],
  ['precioCosto', 'Sin costo'],
  ['stock', 'Stock en 0 o negativo'],
  ['todos', 'Todos'],
]

// Un stock negativo significa que se vendió más de lo que el sistema creía
// tener: también es un dato a corregir, no solo el que está en cero.
function falta(p, campo) {
  return campo === 'stock' ? num(p.stock) <= 0 : !num(p[campo])
}

// Celda editable de un campo numérico del producto.
function Campo({ valor, onChange, sugerencia, ancho = 'w-24' }) {
  const vacio = !valor
  const negativo = String(valor).trim().startsWith('-')
  return (
    <Input
      inputMode="numeric"
      value={valor}
      onChange={(e) => onChange(e.target.value)}
      placeholder={sugerencia ? String(sugerencia) : '0'}
      className={cn(
        ancho,
        'h-9 px-2.5 text-right tabular-nums md:h-8',
        vacio && 'border-warn/40 bg-warn/[.06]',
        negativo && 'border-bad/50 bg-bad/[.08] text-bad',
      )}
    />
  )
}

export default function ProductosIncompletos({ registrarDirty }) {
  const productos = getProductos()
  const ventas = listVentas()
  const prods = productosById()
  const vends = vendedoresById()

  const [filtro, setFiltro] = useState('comision')
  const [busqueda, setBusqueda] = useState('')
  const [draft, setDraft] = useState({}) // { [id]: { comision, precioCosto, stock } }
  const [aviso, setAviso] = useState('')
  const [mes, setMes] = useState(() => fechaClave().slice(0, 7))
  const [confirmando, setConfirmando] = useState(false)

  const activos = useMemo(() => productos.filter((p) => p.activo !== false), [productos])

  const faltantes = useMemo(
    () => ({
      comision: activos.filter((p) => falta(p, 'comision')).length,
      precioCosto: activos.filter((p) => falta(p, 'precioCosto')).length,
      stock: activos.filter((p) => falta(p, 'stock')).length,
    }),
    [activos],
  )

  // Productos que entran en la lista según el filtro y la búsqueda.
  const lista = useMemo(() => {
    const base =
      filtro === 'todos'
        ? activos.filter(
            (p) => falta(p, 'comision') || falta(p, 'precioCosto') || falta(p, 'stock'),
          )
        : activos.filter((p) => falta(p, filtro))
    const q = norm(busqueda.trim())
    return q ? base.filter((p) => norm(p.nombre).includes(q)) : base
  }, [activos, filtro, busqueda])

  const valor = (p, campo) =>
    draft[p.id]?.[campo] ?? (num(p[campo]) ? String(num(p[campo])) : '')

  const setCampo = (id, campo, v) =>
    setDraft((d) => ({ ...d, [id]: { ...d[id], [campo]: v } }))

  // Solo los campos cuyo valor escrito difiere del guardado.
  const cambios = useMemo(() => {
    const out = []
    Object.entries(draft).forEach(([id, campos]) => {
      const p = prods[id]
      if (!p) return
      const dif = {}
      Object.entries(campos).forEach(([k, v]) => {
        const n = parse(k, v)
        if (n !== num(p[k])) dif[k] = n
      })
      if (Object.keys(dif).length) out.push([id, dif])
    })
    return out
  }, [draft, prods])

  useEffect(() => {
    registrarDirty?.(() => cambios.length > 0)
    return () => registrarDirty?.(null)
  }, [cambios.length, registrarDirty])

  function guardar() {
    cambios.forEach(([id, dif]) => updateProducto(id, dif))
    setDraft({})
    setAviso(`Se guardaron ${cambios.length} producto${cambios.length === 1 ? '' : 's'}.`)
  }

  function aplicarSugeridas() {
    let n = 0
    setDraft((d) => {
      const nuevo = { ...d }
      activos.forEach((p) => {
        if (num(p.comision)) return
        const s = sugerida(p.nombre)
        if (!s) return
        nuevo[p.id] = { ...nuevo[p.id], comision: String(s) }
        n++
      })
      return nuevo
    })
    setAviso(
      n
        ? `Se cargaron ${n} comisiones sugeridas. Revisalas y apretá Guardar.`
        : 'No quedan comisiones sugeridas para cargar.',
    )
  }

  const sinFamilia = useMemo(
    () => activos.filter((p) => !num(p.comision) && !sugerida(p.nombre)),
    [activos],
  )

  // ── Paso 2: ventas del mes que quedaron guardadas con comisión 0 ──
  const pendientes = useMemo(() => {
    return ventas
      .filter((v) => (v.fecha || '').startsWith(mes) && !num(v.comision))
      .map((v) => {
        const p = prods[v.productoId]
        return { v, c: num(p?.comision) || sugerida(v.productoNombre || p?.nombre) }
      })
      .filter((x) => x.c > 0)
  }, [ventas, prods, mes])

  const impacto = useMemo(() => {
    const m = {}
    pendientes.forEach(({ v, c }) => {
      const n = vends[v.vendedorId] || '—'
      if (!m[n]) m[n] = { q: 0, t: 0 }
      m[n].q += 1
      m[n].t += c
    })
    return Object.entries(m).sort((a, b) => b[1].t - a[1].t)
  }, [pendientes, vends])

  const totalPendiente = impacto.reduce((a, [, x]) => a + x.t, 0)

  function corregirVentas() {
    pendientes.forEach(({ v, c }) => updateVenta(v.id, { comision: c }))
    setConfirmando(false)
    setAviso(
      `Se corrigieron ${pendientes.length} ventas de ${nombreMes(mes)} por ${gs(totalPendiente)}.`,
    )
  }

  return (
    <div className="space-y-4">
      {/* ── Estado general ─────────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-3">
        {FILTROS.slice(0, 3).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setFiltro(k)}
            className={cn(
              'rounded-xl border p-4 text-left transition',
              filtro === k
                ? 'border-fono/50 bg-fono/[.10]'
                : 'border-ink-600 bg-ink-800 hover:border-fono/30',
            )}
          >
            <div className="text-[11px] font-medium uppercase tracking-wider text-mute">
              {label}
            </div>
            <div
              className={cn(
                'mt-1.5 text-2xl font-semibold tabular-nums',
                faltantes[k] ? 'text-warn' : 'text-ok',
              )}
            >
              {faltantes[k]}
            </div>
            <div className="mt-1 text-xs text-mute">
              de {activos.length} productos activos
            </div>
          </button>
        ))}
      </div>

      {aviso && (
        <div className="flex items-center gap-2.5 rounded-xl border border-ok/30 bg-ok/10 px-4 py-3 text-sm text-ok">
          <Icon name="check" className="h-4 w-4 shrink-0" />
          <span className="flex-1">{aviso}</span>
          <button onClick={() => setAviso('')} className="text-ok/60 hover:text-ok">
            <Icon name="close" className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── Paso 1: completar los productos ────────────────────── */}
      <Card className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Badge color="blue">Paso 1</Badge>
              <h2 className="font-semibold">Completar los productos</h2>
            </div>
            <p className="mt-1.5 max-w-2xl text-sm text-mute">
              La comisión y el costo que cargues acá valen para las{' '}
              <strong className="text-white">ventas nuevas</strong>. Las ventas ya cargadas
              guardaron una copia del valor que había en ese momento, y se arreglan en el paso 2.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {cambios.length > 0 && (
              <span className="whitespace-nowrap text-xs text-warn">
                ● {cambios.length} sin guardar
              </span>
            )}
            <Button onClick={guardar} disabled={cambios.length === 0}>
              <Icon name="save" className="h-4 w-4" />
              Guardar
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-ink-500 p-0.5">
            {FILTROS.map(([k, label]) => (
              <button
                key={k}
                onClick={() => setFiltro(k)}
                className={cn(
                  'rounded-[6px] px-3 py-1.5 text-xs font-medium transition',
                  filtro === k ? 'bg-fono text-white' : 'text-mute hover:text-white',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="relative min-w-[180px] flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-mute">
              <Icon name="search" className="h-4 w-4" />
            </span>
            <Input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar producto…"
              autoCapitalize="none"
              autoCorrect="off"
              className="h-9 pl-9 md:h-9"
            />
          </div>

          {filtro === 'comision' && faltantes.comision > 0 && (
            <Button variant="outline" onClick={aplicarSugeridas}>
              <Icon name="sparkles" className="h-4 w-4" />
              Usar sugeridas
            </Button>
          )}
        </div>

        {lista.length === 0 ? (
          <div className="py-12 text-center">
            <Icon name="check" className="mx-auto mb-3 h-8 w-8 text-ok" />
            <p className="text-sm text-mute">
              {busqueda
                ? 'Ningún producto coincide con la búsqueda.'
                : 'No queda ningún producto con este dato incompleto.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-600 text-left text-[11px] font-medium uppercase tracking-wider text-mute">
                  <th className="py-2.5 pr-3">Producto</th>
                  <th className="w-28 py-2.5 px-2 text-right">Comisión ₲</th>
                  <th className="w-28 py-2.5 px-2 text-right">Costo ₲</th>
                  <th className="w-24 py-2.5 px-2 text-right">Stock</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((p) => {
                  const sug = sugerida(p.nombre)
                  return (
                    <tr key={p.id} className="border-b border-ink-600/50">
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-2">
                          <span className="min-w-0 truncate">{p.nombre}</span>
                          {!num(p.comision) && !sug && (
                            <Badge color="orange" className="shrink-0">
                              sin sugerencia
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-2 text-right">
                        <Campo
                          valor={valor(p, 'comision')}
                          onChange={(v) => setCampo(p.id, 'comision', v)}
                          sugerencia={sug}
                        />
                      </td>
                      <td className="px-2 py-2 text-right">
                        <Campo
                          valor={valor(p, 'precioCosto')}
                          onChange={(v) => setCampo(p.id, 'precioCosto', v)}
                        />
                      </td>
                      <td className="px-2 py-2 text-right">
                        <Campo
                          valor={valor(p, 'stock')}
                          onChange={(v) => setCampo(p.id, 'stock', v)}
                          ancho="w-20"
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {sinFamilia.length > 0 && (
          <div className="flex gap-2.5 rounded-lg border border-warn/25 bg-warn/[.07] p-3.5">
            <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
            <div className="text-xs leading-relaxed text-mute">
              <strong className="text-white">
                {sinFamilia.length} producto{sinFamilia.length === 1 ? '' : 's'} sin sugerencia
              </strong>{' '}
              — no se parecen a nada que ya tenga comisión cargada, así que los tenés que definir a
              mano: {sinFamilia.map((p) => p.nombre).join(' · ')}
            </div>
          </div>
        )}
      </Card>

      {/* ── Paso 2: corregir las ventas ya cargadas ────────────── */}
      <Card className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Badge color="blue">Paso 2</Badge>
              <h2 className="font-semibold">Corregir las ventas ya cargadas</h2>
            </div>
            <p className="mt-1.5 max-w-2xl text-sm text-mute">
              Cada venta guarda la comisión que el producto tenía en ese momento. Las que se
              cargaron cuando el producto estaba en ₲0 quedaron en ₲0 para siempre, aunque ahora
              arregles el producto. Acá se les pone la que corresponde.
            </p>
          </div>
          <select
            value={mes}
            onChange={(e) => setMes(e.target.value)}
            className="h-9 shrink-0 cursor-pointer rounded-lg border border-ink-500 bg-ink-800 px-3 text-sm text-white outline-none focus:border-fono [&>option]:bg-ink-800"
          >
            {mesesRecientes().map((m) => (
              <option key={m} value={m}>
                {nombreMes(m)}
              </option>
            ))}
          </select>
        </div>

        {pendientes.length === 0 ? (
          <div className="py-10 text-center">
            <Icon name="check" className="mx-auto mb-3 h-8 w-8 text-ok" />
            <p className="text-sm text-mute">
              Todas las ventas de {nombreMes(mes)} tienen su comisión.
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-hidden rounded-xl border border-ink-600">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-600 bg-ink-700/40 text-left text-[11px] font-medium uppercase tracking-wider text-mute">
                    <th className="px-4 py-2.5">Vendedor</th>
                    <th className="px-4 py-2.5 text-right">Ventas en ₲0</th>
                    <th className="px-4 py-2.5 text-right">Se le suma</th>
                  </tr>
                </thead>
                <tbody>
                  {impacto.map(([nombre, x]) => (
                    <tr key={nombre} className="border-b border-ink-600/50 last:border-0">
                      <td className="px-4 py-2.5 font-medium">{nombre}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-mute">{x.q}</td>
                      <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-ok">
                        + {gs(x.t)}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-ink-700/40">
                    <td className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-mute">
                      Total
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{pendientes.length}</td>
                    <td className="px-4 py-2.5 text-right text-base font-semibold tabular-nums text-ok">
                      + {gs(totalPendiente)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-mute">
                Solo toca {nombreMes(mes)}. Los meses anteriores quedan como están.
              </p>
              <Button onClick={() => setConfirmando(true)}>
                <Icon name="check" className="h-4 w-4" />
                Corregir {pendientes.length} ventas
              </Button>
            </div>
          </>
        )}
      </Card>

      {/* ── Confirmación ───────────────────────────────────────── */}
      {confirmando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-md">
            <h2 className="mb-1 font-semibold">¿Corregir {pendientes.length} ventas?</h2>
            <p className="mb-4 text-sm text-mute">
              Se les va a cargar la comisión a las ventas de{' '}
              <strong className="text-white">{nombreMes(mes)}</strong> que hoy están en ₲0. La
              comisión del mes sube {gs(totalPendiente)}.
            </p>
            <div className="mb-5 space-y-1.5 rounded-lg border border-ink-600 p-3 text-sm">
              {impacto.map(([nombre, x]) => (
                <div key={nombre} className="flex justify-between gap-3">
                  <span className="text-mute">{nombre}</span>
                  <span className="tabular-nums text-ok">+ {gs(x.t)}</span>
                </div>
              ))}
            </div>
            <p className="mb-5 text-xs text-mute">
              Queda registrado en el Historial, así que después podés ver exactamente qué cambió.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setConfirmando(false)}>
                Cancelar
              </Button>
              <Button variant="success" className="flex-1" onClick={corregirVentas}>
                Sí, corregir
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
