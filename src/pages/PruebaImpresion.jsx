import { Link, useSearchParams } from 'react-router-dom'
import { Card, Eyebrow } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import { useSesion } from '@/lib/sesion'
import { enlaceLogin } from '@/lib/urls'
import { TIPOS_TICKET_PRUEBA } from '@/lib/printing/tickets'
import { leerPrueba } from '@/lib/printing/qr'

const IMPRESORAS = '/configuracion/impresoras'

function fechaLegible(valor) {
  if (!valor) return ''
  const fecha = new Date(valor)
  return Number.isNaN(fecha.getTime()) ? valor : fecha.toLocaleString('es-PY', { dateStyle: 'long', timeStyle: 'short' })
}

const Dato = ({ etiqueta, valor }) => (
  <div className="rounded-xl bg-ink-800/60 p-3">
    <p className="text-xs text-mute">{etiqueta}</p>
    <p className="mt-1 break-words font-semibold">{valor}</p>
  </div>
)

// Página autocontenida del ticket de prueba: todos los datos salen del QR (la
// prueba es local del agente y no existe en la base). Sirve para verificar,
// desde el teléfono, que el papel que salió coincide con lo que la app mandó.
// No muestra datos de clientes: nunca viajan en esta URL.
export default function PruebaImpresion() {
  const [parametros] = useSearchParams()
  const { estado } = useSesion()
  const prueba = leerPrueba(parametros)
  const formato = TIPOS_TICKET_PRUEBA[prueba.tipo] || prueba.tipo || ''
  const hayDatos = Boolean(prueba.destino || prueba.validacion || prueba.fecha || prueba.tipo)
  const conSesion = estado === 'dentro' || estado === 'sinEmpresa'
  const destinoImpresoras = conSesion ? IMPRESORAS : enlaceLogin(IMPRESORAS)

  return (
    <main className="min-h-screen bg-ink-950 px-4 py-10 text-fore">
      <div className="mx-auto max-w-xl">
        <header className="mb-8 text-center">
          <p className="text-xs font-bold uppercase tracking-[.2em] text-fono-light">Prueba de impresión</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">Verificación física</h1>
          <p className="mt-1 text-sm text-mute">Este código salió impreso en un ticket de prueba de MobOS.</p>
        </header>

        {hayDatos ? (
          <div className="space-y-4">
            <section className="rounded-2xl border border-ink-600 bg-ink-900 p-5">
              <Eyebrow>Datos de esta prueba</Eyebrow>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <Dato etiqueta="Destino" valor={prueba.destino || 'Sin destino informado'} />
                <Dato etiqueta="Validación" valor={prueba.validacion || 'Sin número'} />
                <Dato etiqueta="Fecha" valor={fechaLegible(prueba.fecha) || 'Sin fecha'} />
                <Dato etiqueta="Formato" valor={formato || 'Sin formato'} />
              </div>
            </section>

            <section className="rounded-2xl border border-fono/25 bg-fono/5 p-5">
              <h2 className="font-semibold text-fono-light">Cómo se verifica</h2>
              <ol className="mt-3 space-y-3 text-sm">
                <li className="flex gap-2">
                  <Icon name="printer" className="mt-0.5 h-4 w-4 shrink-0 text-fono-light" />
                  <span>El <strong>papel tiene que salir</strong> de la impresora. Si no salió, todavía no hay nada que verificar.</span>
                </li>
                <li className="flex gap-2">
                  <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-ok" />
                  <span>El <strong>corte tiene que separar</strong> el papel: mirá si la hoja se desprende limpia al final del ticket.</span>
                </li>
                <li className="flex gap-2">
                  <Icon name="search" className="mt-0.5 h-4 w-4 shrink-0 text-mute" />
                  <span>Compará el número de validación del papel con el de arriba: tienen que ser el mismo.</span>
                </li>
              </ol>
            </section>

            <section className="rounded-2xl border border-ink-600 bg-ink-900 p-5 text-center">
              <p className="text-sm text-mute">Si el papel no salió, salió cortado o no cortó, el problema está en la impresora o en el puente.</p>
              <Link
                to={destinoImpresoras}
                className="mt-4 inline-flex h-11 items-center justify-center rounded-lg bg-fono px-5 text-sm font-semibold text-onbrand transition hover:bg-fono-light"
              >
                Configuración → Impresoras
              </Link>
              <p className="mt-3 text-xs text-mute">Sin sesión, primero te pedimos que entres y después volvés acá.</p>
            </section>
          </div>
        ) : (
          <Card className="text-center">
            <Icon name="alert" className="mx-auto h-6 w-6 text-warn" />
            <h2 className="mt-3 font-semibold">Este código llegó sin datos de prueba</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm text-mute">
              No se puede saber qué impresora ni qué validación corresponden. Imprimí una prueba nueva desde
              Configuración → Impresoras y escaneá ese papel.
            </p>
            <Link
              to={destinoImpresoras}
              className="mt-4 inline-flex h-11 items-center justify-center rounded-lg bg-fono px-5 text-sm font-semibold text-onbrand transition hover:bg-fono-light"
            >
              Configuración → Impresoras
            </Link>
          </Card>
        )}

        <div className="mt-6 text-center">
          <Link to={conSesion ? '/' : '/login'} className="text-sm text-mute transition hover:text-fore">
            Ir a la app
          </Link>
        </div>
      </div>
    </main>
  )
}
