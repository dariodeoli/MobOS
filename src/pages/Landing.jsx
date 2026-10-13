import { ArrowRight, Check, ChevronDown, Menu, Store, X } from 'lucide-react'
import { useState } from 'react'
import { publicUrls } from '@/lib/urls'
import ImeiVerificador from '@/components/landing/ImeiVerificador'
import CommercialPreview from '@/components/landing/CommercialPreview'
import ProductFooter from '@/components/app/ProductFooter'
import ThemeLogo from '@/components/app/ThemeLogo'
import ThemeToggle from '@/components/app/ThemeToggle'
import { temaV2Activo } from '@/lib/temaV2'
import './Landing.css'

const NAV = [
  ['#vender', 'Vender'],
  ['#controlar', 'Controlar'],
  ['#imei', 'Verificación IMEI'],
  ['#precio', 'Precio'],
  ['#demo', 'Demo'],
]
const stories = [
  {
    id: 'vender',
    moment: 'sell',
    number: '01',
    label: 'En el mostrador',
    title: 'La venta avanza. El control se queda.',
    description:
      'Encuentra el equipo, prepara el carrito y registra el cobro sin separar la venta del inventario.',
    points: [
      'Búsqueda por nombre, modelo o IMEI.',
      'Carrito con descuentos y combos.',
      'Cobros combinados, parciales y con saldo.',
    ],
  },
  {
    id: 'controlar',
    moment: 'stock',
    number: '02',
    label: 'Detrás de cada equipo',
    title: 'No es una cantidad. Es un teléfono concreto.',
    description:
      'Cada unidad tiene su identidad. Conecta la recepción, la ubicación y la venta con el historial del mismo equipo.',
    points: [
      'Stock por IMEI, ubicación y estado.',
      'Recepción total o parcial de compras.',
      'Reservas y movimientos entre sucursales.',
    ],
  },
  {
    id: 'cerrar',
    moment: 'payment',
    number: '03',
    label: 'Después de la venta',
    title: 'El pedido continúa. La información también.',
    description:
      'El saldo, la caja y el seguimiento no quedan en conversaciones sueltas. La operación sigue vinculada al cliente y a su pedido.',
    points: [
      'Caja por turnos y conciliación por cuenta y medio.',
      'Portal del cliente con enlace o QR: seguimiento, cuotas y garantías.',
      'Servicio técnico, impresión térmica 58/80 mm y A4.',
    ],
  },
]

const faqs = [
  [
    '¿Puedo probar antes de crear una cuenta?',
    'Sí. La demo es una tienda de ejemplo, anónima y con datos ficticios: ingresa con el PIN 2001 como vendedor o 3001 como dueño (también hay gerente, caja, técnico y delivery), sin instalar nada.',
  ],
  [
    '¿Cómo se verifica un IMEI?',
    'Desde la ficha del equipo (recepción, Trade-In o inventario) puedes iniciar la consulta: blacklist, Find My/iCloud, SIM lock, MDM y garantía. Cada consulta se confirma antes de ejecutarse (sin cargos automáticos), queda auditada y, si falta un dato, el estado dice «No verificado», nunca un «limpio» inventado. En la demo se muestra con datos simulados.',
  ],
  [
    '¿Cada vendedor tiene su propio acceso?',
    'La tienda entra con un solo correo y cada vendedor abre su turno con un PIN de 4 a 6 dígitos. Cada venta queda a su nombre y su rol define qué puede ver y hacer.',
  ],
  [
    '¿Funciona sin internet?',
    'Sí. MobOS es una PWA instalable: la venta sigue disponible sin conexión, se guarda en el equipo y se sincroniza cuando vuelve la red.',
  ],
  [
    '¿Sirve para más de una sucursal?',
    'Sí. MobOS separa empresa, sucursal y ubicación física, con movimientos auditables entre locales y puentes de impresión por sucursal.',
  ],
]

export default function Landing() {
  const [open, setOpen] = useState(0)
  const [menu, setMenu] = useState(false)
  const { app } = publicUrls
  return (
    <div className={temaV2Activo() ? 'mobos-commercial-landing tema-v2' : 'mobos-commercial-landing'}>
      <header className="landing-header">
        <div className="landing-nav landing-container">
          <a href="#inicio" aria-label="MobOS" className="landing-logo">
            <ThemeLogo className="h-9" />
          </a>
          <nav className="landing-desktop-nav" aria-label="Navegación principal">
            {NAV.map(([href, label]) => (
              <a key={href} href={href}>
                {label}
              </a>
            ))}
          </nav>
          <div className="landing-nav-actions">
            <a className="landing-login" href={`${app}/login`}>
              Ingresar
            </a>
            <ThemeToggle />
            <a className="landing-nav-demo landing-button" href={`${app}/demo`}>
              Probar demo
            </a>
            <button
              className="landing-menu-toggle"
              type="button"
              onClick={() => setMenu(value => !value)}
              onKeyDown={event => {
                if (event.key === 'Escape') setMenu(false)
              }}
              aria-expanded={menu}
              aria-controls="menu-movil"
              aria-label={menu ? 'Cerrar menú' : 'Abrir menú'}
            >
              {menu ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
        {menu && (
          <div
            id="menu-movil"
            className="landing-mobile-menu landing-container"
            onKeyDown={event => {
              if (event.key === 'Escape') {
                setMenu(false)
                document.querySelector('.landing-menu-toggle')?.focus()
              }
            }}
          >
            <nav aria-label="Secciones">
              {NAV.map(([href, label]) => (
                <a key={href} href={href} onClick={() => setMenu(false)}>
                  {label}
                </a>
              ))}
            </nav>
            <a className="landing-button" href={`${app}/demo`}>
              Probar la demo
            </a>
            <a className="landing-secondary" href={`${app}/login`}>
              Crear mi tienda
            </a>
          </div>
        )}
      </header>
      <main>
        <section id="inicio" className="landing-hero landing-container">
          <div className="landing-hero-copy">
            <p className="landing-eyebrow">EL SISTEMA PARA TU TIENDA DE TELÉFONOS</p>
            <h1>
              Vende teléfonos.
              <br />
              No pierdas
              <br />
              <span>el control.</span>
            </h1>
            <p className="landing-intro">
              Del equipo que entra al dinero que cobras. Ventas, stock por IMEI y seguimiento de
              pedidos, conectados en MobOS.
            </p>
            <div className="landing-hero-actions">
              <a className="landing-button" href={`${app}/demo`}>
                Probar la demo (sin registro)
                <ArrowRight size={18} />
              </a>
              <a className="landing-secondary" href={`${app}/login`}>
                Crear mi tienda
                <ArrowRight size={16} />
              </a>
            </div>
            <p className="landing-hero-note">
              Planes pendientes de confirmación
              <br />
              Acceso con correo o Google
            </p>
          </div>
          <CommercialPreview />
        </section>
        <section className="landing-operation" aria-label="Una operación conectada">
          <div className="landing-container">
            <p>
              DEL MOSTRADOR
              <br />
              <strong>A TODO EL NEGOCIO.</strong>
            </p>
            <ol>
              <li>
                <span>01</span> Vende el equipo
              </li>
              <li>
                <span>02</span> Sigue su IMEI
              </li>
              <li>
                <span>03</span> Controla el cobro
              </li>
            </ol>
          </div>
        </section>
        <section
          className="landing-stories landing-container"
          aria-label="Vender, controlar y cerrar la operación"
        >
          {stories.map(story => (
            <article id={story.id} key={story.id} className="landing-story">
              <div className="landing-story-copy">
                <p className="landing-eyebrow">
                  {story.number} / {story.label}
                </p>
                <h2>{story.title}</h2>
                <p>{story.description}</p>
                <ul>
                  {story.points.map(point => (
                    <li key={point}>
                      <Check size={17} />
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <CommercialPreview moment={story.moment} />
                {story.id === 'cerrar' && (
                  <a
                    className="landing-secondary landing-portal-link"
                    href={`${app}/cuenta/demo-demo-cliente-lucia-rapido`}
                  >
                    Ver el portal de la demo
                    <ArrowRight size={16} />
                  </a>
                )}
              </div>
            </article>
          ))}
        </section>
        <section className="landing-responsibility landing-container">
          <p className="landing-eyebrow">CADA PERSONA, SU RESPONSABILIDAD</p>
          <h2>
            Un equipo de trabajo.
            <br />
            El permiso justo para cada rol.
          </h2>
          <dl>
            <div>
              <dt>Dueño</dt>
              <dd>Precios, permisos, caja y auditoría del negocio.</dd>
            </div>
            <div>
              <dt>Vendedor</dt>
              <dd>Ventas con PIN propio, stock, clientes y cotizaciones.</dd>
            </div>
            <div>
              <dt>Técnico</dt>
              <dd>Recepción, diagnóstico, repuestos y entrega.</dd>
            </div>
          </dl>
          <p className="landing-small">
            Proveedor → inventario → venta → posventa. Cada movimiento, con su responsable.
          </p>
        </section>
        <section id="imei" className="mx-auto max-w-7xl scroll-mt-20 px-5 py-20">
          <p className="text-xs font-bold uppercase tracking-[.2em] text-fono-dark">
            Antes de comprar o canjear
          </p>
          <h2 className="mt-3 max-w-2xl font-display text-4xl font-bold tracking-[-.04em] sm:text-5xl">
            Verifica un IMEI sin inventar un «limpio».
          </h2>
          <p className="mt-4 max-w-2xl leading-7 text-mute">
            Cada consulta se confirma antes de ejecutarse (sin cargos automáticos), queda auditada
            con fuente y hora, y los estados sin dato dicen «No verificado».
          </p>
          <div className="mt-8">
            <ImeiVerificador />
          </div>
        </section>

        <section id="precio" className="landing-pricing landing-container">
          <div>
            <p className="landing-eyebrow">CONDICIONES COMERCIALES</p>
            <h2>Planes pendientes de confirmación.</h2>
            <p>
              Las condiciones del plan deben confirmarse antes de contratar. Puedes conocer el
              funcionamiento de MobOS en la demo, sin registro.
            </p>
          </div>
          <div className="landing-hero-actions">
            <a className="landing-button" href={`${app}/demo`}>
              Probar la demo
              <ArrowRight size={18} />
            </a>
            <a className="landing-secondary" href={`${app}/login`}>
              Crear mi tienda
            </a>
          </div>
        </section>
        <section className="mx-auto max-w-4xl px-5 pb-20">
          <p className="text-center text-xs font-bold uppercase tracking-[.2em] text-fono-dark">
            Preguntas rápidas
          </p>
          <h2 className="mt-4 text-center font-display text-3xl font-bold sm:text-4xl">
            Todo claro antes de empezar.
          </h2>
          <div className="mt-10 space-y-3">
            {faqs.map(([q, a], i) => (
              <article
                key={q}
                className="overflow-hidden rounded-2xl border border-fore/[.08] bg-ink shadow-card"
              >
                <button
                  onClick={() => setOpen(open === i ? -1 : i)}
                  aria-expanded={open === i}
                  aria-controls={`faq-respuesta-${i}`}
                  className="flex min-h-11 w-full items-center justify-between gap-4 p-5 text-left"
                >
                  <b className="text-sm sm:text-base">{q}</b>
                  <ChevronDown
                    className={`shrink-0 text-fono-dark transition ${open === i ? 'rotate-180' : ''}`}
                    size={19}
                  />
                </button>
                {open === i && (
                  <p id={`faq-respuesta-${i}`} className="px-5 pb-5 text-sm leading-6 text-mute">
                    {a}
                  </p>
                )}
              </article>
            ))}
          </div>
        </section>

        <section id="demo" className="landing-closing">
          <div className="landing-container">
            <div>
              <p className="landing-eyebrow">CONOCE MOBOS POR DENTRO</p>
              <h2>
                Tu próxima venta.
                <br />
                Con todo en su lugar.
              </h2>
              <p>
                La demo real sigue disponible, con datos ficticios y sin registro.
                <br />
                PIN 2001: vendedor · PIN 3001: dueño.
              </p>
            </div>
            <div className="landing-hero-actions">
              <a className="landing-button" href={`${app}/demo`}>
                Probar la demo
                <ArrowRight size={18} />
              </a>
              <a className="landing-secondary" href={`${app}/login`}>
                Crear mi tienda
              </a>
            </div>
          </div>
        </section>
      </main>
      <ProductFooter
        className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-5 border-t-0 px-5 py-8 text-xs"
        leading={
          <span className="flex items-center gap-2">
            <Store size={14} className="text-fono-dark" />
            <b className="text-fore">MobOS</b>
          </span>
        }
      >
        <span className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
          <a
            className="inline-flex min-h-11 min-w-11 items-center justify-center px-2 transition hover:text-fono-dark"
            href="mailto:soporte@moboss.online"
          >
            Soporte
          </a>
          <a
            className="inline-flex min-h-11 min-w-11 items-center justify-center px-2 transition hover:text-fono-dark"
            href="/status"
          >
            Estado
          </a>
          <a
            className="inline-flex min-h-11 min-w-11 items-center justify-center px-2 transition hover:text-fono-dark"
            href="/privacidad"
          >
            Privacidad
          </a>
          <a
            className="inline-flex min-h-11 min-w-11 items-center justify-center px-2 transition hover:text-fono-dark"
            href="/terminos"
          >
            Términos
          </a>
        </span>
      </ProductFooter>
    </div>
  )
}
