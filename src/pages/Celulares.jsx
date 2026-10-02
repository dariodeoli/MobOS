import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toPng } from 'html-to-image'
import { listCelulares, rankCelular, rankCapacidad } from '@/lib/storage'
import { useLive } from '@/hooks/useLive'
import { gs } from '@/utils/calculos'
import { Button, Card } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import BarraModulo from '@/components/shared/BarraModulo'
import { APP_NAME } from '@/lib/brand'
import ThemeLogo from '@/components/app/ThemeLogo'

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
            <div
              className={`font-extrabold text-sm mb-1.5 border-b border-ink-600 pb-1 ${tema.modelo}`}
            >
              {modelo}
            </div>
            <div className="space-y-1">
              {lista.map((c) => (
                <div key={c.id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-1.5 text-mute">
                    <span className="font-semibold">{c.capacidad}</span>
                    {c.color && <span className="text-mute">· {c.color}</span>}
                  </div>
                  <div className="font-extrabold text-fore">{gs(c.precio)}</div>
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
      const dataUrl = await toPng(ref.current, { pixelRatio: 2, backgroundColor: '#0E1013' })
      const blob = await (await fetch(dataUrl)).blob()
      const file = new File([blob], 'lista-precios-mobtock.png', { type: 'image/png' })

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `Lista de Precios · ${APP_NAME}`,
          text: 'Lista de precios',
        })
      } else {
        const link = document.createElement('a')
        link.download = 'lista-precios-mobtock.png'
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
    <div className="space-y-4">
      {/* #278 · composición compacta (#256): la identidad y las acciones viven
          en la barra; la tarjeta exportable queda intacta para compartir. */}
      <BarraModulo
        icono="tag"
        titulo="Lista por modelo"
        descripcion="Precios de nuevos y semi-nuevos por modelo y capacidad, listos para compartir con el cliente."
        testId="barra-celulares"
      >
        <Button variant="success" onClick={exportar} disabled={!conPrecio.length || exportando}>
          <Icon name="share" className="h-4 w-4" />{exportando ? 'Generando…' : 'Compartir por WhatsApp'}
        </Button>
        <Button variant="outline" onClick={() => navigate('/comparador')}>
          <Icon name="report" className="h-4 w-4" />Comparar
        </Button>
        {/* #303: el Centro de Control es la fuente de esta lista y se llega
            desde acá, además del menú y la búsqueda. */}
        <Button variant="outline" onClick={() => navigate('/centro-control')} data-testid="ir-centro-control">
          <Icon name="settings" className="h-4 w-4" />Centro de Control
        </Button>
      </BarraModulo>

      <main className="mx-auto max-w-3xl space-y-4">
        {!conPrecio.length && (
          <Card className="text-center text-mute py-10">
            <div className="text-4xl mb-2">
              <Icon name="phone" className="h-4 w-4" />
            </div>
            <p className="text-sm">
              Todavía no hay precios cargados.
              <br />
              Cargalos en el Centro de Control Celulares y aparecen acá.
            </p>
            <div className="mt-4 flex justify-center">
              <Button variant="outline" onClick={() => navigate('/centro-control')}>Abrir Centro de Control</Button>
            </div>
          </Card>
        )}

        {/* Tarjeta exportable */}
        {conPrecio.length > 0 && (
          <div ref={ref} className="rounded-2xl bg-ink-800 overflow-hidden border border-ink-600">
            {/* Encabezado branded */}
            <div className="bg-gradient-to-br from-fono-dark via-fono to-fono-accent text-onbrand p-5">
            <ThemeLogo className="h-8 mb-2" variante="dark" />
              <div className="text-lg font-extrabold">Lista de Precios</div>
              <div className="text-xs opacity-80">Actualizado: {hoy}</div>
            </div>

            <div className="p-4 space-y-5">
              <BloqueCondicion
                titulo="NUEVOS"
                items={nuevos}
                tema={{
                  encabezado: 'bg-ok/15 text-ok',
                  modelo: 'text-ok border-ok/40',
                }}
              />
              <BloqueCondicion
                titulo="SEMI-NUEVOS"
                items={seminuevos}
                tema={{
                  encabezado: 'bg-warn/15 text-warn',
                  modelo: 'text-warn border-warn/40',
                }}
              />
            </div>

            <div className="bg-ink-700 px-4 py-3 text-center text-xs text-mute border-t border-ink-600">
              <strong className="text-fono">{APP_NAME}</strong> · Consultá disponibilidad y
              trade-in de tu equipo usado
            </div>
          </div>
        )}

        <p className="text-center text-xs text-mute">
          Tocá <strong>Compartir por WhatsApp</strong> para enviar la imagen al cliente.
        </p>
      </main>
    </div>
  )
}
