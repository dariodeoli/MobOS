import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toPng } from 'html-to-image'
import { listCelulares, rankCelular, rankCapacidad } from '@/lib/storage'
import { useLive } from '@/hooks/useLive'
import { gs } from '@/utils/calculos'
import { Button, Card } from '@/components/ui'

// Agrupa por modelo (más nuevo arriba; capacidad ascendente dentro de cada uno).
function agrupar(celulares) {
  const ordenados = [...celulares].sort(
    (a, b) =>
      rankCelular(a.modelo) - rankCelular(b.modelo) ||
      rankCapacidad(a.capacidad) - rankCapacidad(b.capacidad),
  )
  const grupos = new Map()
  ordenados.forEach((c) => {
    if (!grupos.has(c.modelo)) grupos.set(c.modelo, [])
    grupos.get(c.modelo).push(c)
  })
  return [...grupos.entries()]
}

// Bloque de una condición (Nuevos / Semi-nuevos) con su color distintivo.
function BloqueCondicion({ titulo, items, tema }) {
  if (!items.length) return null
  const grupos = agrupar(items)
  return (
    <div>
      <div className={`rounded-lg px-3 py-1.5 font-extrabold text-sm mb-2 ${tema.encabezado}`}>
        {titulo}
      </div>
      <div className="space-y-3">
        {grupos.map(([modelo, lista]) => (
          <div key={modelo}>
            <div className={`font-extrabold text-sm mb-1.5 border-b border-slate-100 pb-1 ${tema.modelo}`}>
              {modelo}
            </div>
            <div className="space-y-1">
              {lista.map((c) => (
                <div key={c.id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-1.5 text-slate-600">
                    <span className="font-semibold">{c.capacidad}</span>
                    {c.color && <span className="text-slate-400">· {c.color}</span>}
                  </div>
                  <div className="font-extrabold text-slate-900">{gs(c.precio)}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Celulares() {
  useLive()
  const navigate = useNavigate()
  const ref = useRef(null)
  const [exportando, setExportando] = useState(false)

  const conPrecio = listCelulares().filter((c) => c.activo && c.precio > 0)
  const nuevos = conPrecio.filter((c) => c.estado === 'Nuevo')
  const seminuevos = conPrecio.filter((c) => c.estado === 'Seminuevo')
  const hoy = new Date().toLocaleDateString('es-PY', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })

  async function exportar() {
    if (!ref.current || !conPrecio.length) return
    setExportando(true)
    try {
      const dataUrl = await toPng(ref.current, { pixelRatio: 2, backgroundColor: '#ffffff' })
      const blob = await (await fetch(dataUrl)).blob()
      const file = new File([blob], 'lista-precios-fono.png', { type: 'image/png' })

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'Lista de Precios · Fono Mobile Store',
          text: 'Lista de precios 📱',
        })
      } else {
        const link = document.createElement('a')
        link.download = 'lista-precios-fono.png'
        link.href = dataUrl
        link.click()
      }
    } catch {
      /* el usuario canceló o no se pudo compartir */
    } finally {
      setExportando(false)
    }
  }

  return (
    <div className="min-h-dvh bg-slate-100">
      <header className="sticky top-0 z-30 bg-fono text-white pt-safe shadow-md">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold">📱 Lista de Precios</div>
          <Button variant="ghost" className="text-white hover:bg-white/15" onClick={() => navigate('/')}>
            ← Volver
          </Button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4 space-y-4">
        <div className="flex gap-2">
          <Button
            variant="success"
            className="flex-1"
            onClick={exportar}
            disabled={!conPrecio.length || exportando}
          >
            {exportando ? '⏳ Generando…' : '📸 Compartir por WhatsApp'}
          </Button>
          <Button variant="outline" onClick={() => navigate('/comparador')}>
            ⚖️ Comparar
          </Button>
        </div>

        {!conPrecio.length && (
          <Card className="text-center text-slate-400 py-10">
            <div className="text-4xl mb-2">📱</div>
            <p className="text-sm">
              Todavía no hay precios cargados.
              <br />
              El propietario los carga desde el Centro de Control → 📱 Celulares.
            </p>
          </Card>
        )}

        {/* Tarjeta exportable */}
        {conPrecio.length > 0 && (
          <div
            ref={ref}
            className="rounded-2xl bg-white overflow-hidden border border-slate-200"
          >
            {/* Encabezado branded */}
            <div className="bg-gradient-to-br from-fono-dark via-fono to-fono-accent text-white p-5">
              <img src="/logo.svg" alt="Fono Mobile Store" className="h-9 mb-2" />
              <div className="text-lg font-extrabold">Lista de Precios 📱</div>
              <div className="text-xs opacity-80">Actualizado: {hoy}</div>
            </div>

            <div className="p-4 space-y-5">
              <BloqueCondicion
                titulo="✨ NUEVOS"
                items={nuevos}
                tema={{
                  encabezado: 'bg-emerald-100 text-emerald-800',
                  modelo: 'text-emerald-700 border-emerald-100',
                }}
              />
              <BloqueCondicion
                titulo="♻️ SEMI-NUEVOS"
                items={seminuevos}
                tema={{
                  encabezado: 'bg-amber-100 text-amber-800',
                  modelo: 'text-amber-700 border-amber-100',
                }}
              />
            </div>

            <div className="bg-slate-50 px-4 py-3 text-center text-xs text-slate-500 border-t border-slate-100">
              <strong className="text-fono">Fono Mobile Store</strong> · Consultá
              disponibilidad y trade-in de tu equipo usado 🔄
            </div>
          </div>
        )}

        <p className="text-center text-xs text-slate-400">
          💡 Tocá <strong>Compartir por WhatsApp</strong> para enviar la imagen al cliente.
        </p>
      </main>
    </div>
  )
}
