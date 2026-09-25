import { Link } from 'react-router-dom'
import { Card } from '@/components/ui'
import Icon from '@/components/shared/Icon'

// Sección «Comandos y atajos» de Ayuda (#IA · #251): todo lo que se puede hacer
// con el teclado o con el chip de usuario, cada uno con el enlace a la pantalla
// donde funciona. Los atajos del panel viven en PanelVendedor (Ctrl/Cmd+K y
// F1–F4) y los del POS en FormularioVenta (F2 y Ctrl/Cmd+S); el chip de usuario
// está en AppShell (1 clic cambia de vendedor, triple clic bloquea).
const ATAJOS = [
  {
    tecla: 'Ctrl + K', mac: 'Cmd + K', titulo: 'Búsqueda global',
    detalle: 'Busca clientes, productos y pedidos desde cualquier pantalla y salta al resultado.',
    ruta: '/pos', pantalla: 'Panel',
  },
  {
    tecla: 'F1', titulo: 'Nueva venta',
    detalle: 'Abre el POS con una venta en blanco, lista para cargar.',
    ruta: '/pos', pantalla: 'POS',
  },
  {
    tecla: 'F2', titulo: 'Buscar producto',
    detalle: 'En el POS enfoca el buscador de productos; fuera del POS abre Productos con la búsqueda enfocada.',
    ruta: '/productos', pantalla: 'Productos',
  },
  {
    tecla: 'F3', titulo: 'Crear cliente',
    detalle: 'Abre Clientes con el alta de una ficha nueva a la vista.',
    ruta: '/clientes', pantalla: 'Clientes',
  },
  {
    tecla: 'F4', titulo: 'Cotizar Trade-In',
    detalle: 'Abre el cotizador de equipos usados. Si tu rol no tiene la vista, avisa por qué.',
    ruta: '/trade-in', pantalla: 'Trade-In',
  },
  {
    tecla: 'Ctrl + S', mac: 'Cmd + S', titulo: 'Guardar venta (POS)',
    detalle: 'Guarda la venta en curso cuando el cliente, los productos y el cobro están completos.',
    ruta: '/pos', pantalla: 'POS',
  },
  {
    tecla: 'Esc', titulo: 'Cerrar',
    detalle: 'Cierra modales, diálogos y paneles abiertos. También destraba búsquedas y menús.',
    ruta: '/pos', pantalla: 'Panel',
  },
  {
    tecla: '1 clic', titulo: 'Cambiar de vendedor',
    detalle: 'Un clic en el chip de usuario de la barra lateral abre el cambio de vendedor: se confirma con su PIN.',
    ruta: '/pos', pantalla: 'Panel',
  },
  {
    tecla: 'Triple clic', titulo: 'Bloquear pantalla',
    detalle: 'Tres clics seguidos en el chip de usuario bloquean la pantalla; se desbloquea con tu PIN.',
    ruta: '/pos', pantalla: 'Panel',
  },
]

// Pantallas de soporte: no son atajos, pero son las dos pantallas a las que se
// llega desde la ayuda para ver el estado (público) y la operación (dueño).
const SOPORTE = [
  {
    titulo: 'Estado del sistema', ruta: '/status',
    detalle: 'Estado de los servicios públicos de MobOS: API, base y web, con la última verificación.',
  },
  {
    titulo: 'Tablero de operaciones', ruta: '/ops',
    detalle: 'Ritmo de la tienda y del taller: equipos en proceso, colas de consulta y pendientes (solo dueño).',
  },
]

function EnlacePantalla({ ruta, titulo }) {
  return (
    <Link
      to={ruta}
      aria-label={`Ir a ${titulo}`}
      className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-lg border border-fono/40 px-3 py-2 text-xs font-semibold text-fono-light transition hover:bg-fono/10"
    >
      Ir
      <Icon name="external" className="h-3.5 w-3.5" />
    </Link>
  )
}

export default function ComandosAtajos() {
  return (
    <Card className="space-y-3" data-testid="comandos-atajos">
      <div>
        <h2 className="font-semibold">Comandos y atajos</h2>
        <p className="mt-1 text-sm text-mute">
          Todo lo que podés hacer con el teclado o con el chip de usuario, cada uno con su enlace a la pantalla.
        </p>
      </div>

      <div className="space-y-2">
        {ATAJOS.map(({ tecla, mac, titulo, detalle, ruta, pantalla }) => (
          <div key={titulo} className="flex flex-col gap-3 rounded-xl border border-ink-600 p-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-bold">{titulo}</h3>
                <span className="text-xs font-semibold text-mute">{pantalla}</span>
              </div>
              <p className="mt-1 text-sm text-fore">{detalle}</p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2 self-start">
              <kbd className="rounded-md border border-ink-500 bg-ink-700 px-2 py-0.5 text-xs font-semibold text-mute">{tecla}</kbd>
              {mac && <kbd className="rounded-md border border-ink-500 bg-ink-700 px-2 py-0.5 text-xs font-semibold text-mute">{mac}</kbd>}
              <EnlacePantalla ruta={ruta} titulo={titulo} />
            </div>
          </div>
        ))}
      </div>

      <p className="rounded-xl border border-ink-600 bg-ink-700/40 p-3 text-xs text-mute">
        En <b className="text-fore">Mac</b>, las teclas de función van con <b className="text-fore">Fn</b> (<b className="text-fore">Fn+F1</b> … <b className="text-fore">Fn+F4</b>) y los atajos que usan Ctrl usan <b className="text-fore">Cmd</b> (<b className="text-fore">Cmd+K</b>, <b className="text-fore">Cmd+S</b>). Los atajos no actúan mientras escribís en un campo o tenés un diálogo abierto.
      </p>

      <div className="space-y-2">
        <h3 className="text-sm font-bold">Pantallas de soporte</h3>
        {SOPORTE.map(({ titulo, detalle, ruta }) => (
          <div key={titulo} className="flex flex-col gap-3 rounded-xl border border-ink-600 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h4 className="text-sm font-semibold">{titulo}</h4>
              <p className="mt-0.5 text-sm text-mute">{detalle}</p>
            </div>
            <EnlacePantalla ruta={ruta} titulo={titulo} />
          </div>
        ))}
      </div>
    </Card>
  )
}
