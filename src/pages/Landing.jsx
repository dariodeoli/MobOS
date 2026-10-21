import { ArrowRight, Check, ChevronDown, Menu, Store, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { publicUrls } from '@/lib/urls'
import ImeiVerificador from '@/components/landing/ImeiVerificador'
import CommercialPreview from '@/components/landing/CommercialPreview'
import CapacidadesMobOS from '@/components/landing/CapacidadesMobOS'
import ShowcaseMobOS from '@/components/landing/ShowcaseMobOS'
import useReveal from '@/components/landing/useReveal'
import ProductFooter from '@/components/app/ProductFooter'
import ThemeLogo from '@/components/app/ThemeLogo'
import ThemeToggle from '@/components/app/ThemeToggle'
import { temaV2Activo } from '@/lib/temaV2'
import './Landing.css'
import './LandingRediseno.css'

const NAV = [
  ['#capacidades', 'Funciones'],
  ['#vender', 'Vender'],
  ['#controlar', 'Controlar'],
  ['#imei', 'Verificación IMEI'],
  ['#precio', 'Gratis'],
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
  const rootRef = useRef(null)
  useReveal(rootRef)
  return (
    <div
      ref={rootRef}
      className={temaV2Activo() ? 'mobos-commercial-landing tema-v2' : 'mobos-commercial-landing'}
    >
      <header className="landing-header">
        <div className="landing-nav landing-container">
          <a href="#inicio" aria-label="MobOS" className="landing-logo">
            <ThemeLogo className="h-8" />
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
          <div className="landing-hero-copy landing-enter">
            <p className="landing-eyebrow">EL SISTEMA PARA TU TIENDA DE TELÉFONOS</p>
            <h1>
              Vende teléfonos.
              <br />
              No pierdas
              <br />
              <span>el control.</span>
            </h1>
            <p className="landing-intro">
              Del equipo que entra al dinero que cobras. Ventas, stock por IMEI, accesorios con
              cantidad y seguimiento de pedidos, conectados en MobOS.
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
          </div>
          <CommercialPreview />
        </section>
        <section className="landing-operation" aria-label="Una operación conectada">
          <div className="landing-container" data-reveal>
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
        <CapacidadesMobOS />
        <ShowcaseMobOS />
        <section
          className="landing-stories landing-container"
          aria-label="Vender, controlar y cerrar la operación"
        >
          {stories.map(story => (
            <article id={story.id} key={story.id} className="landing-story">
              <div className="landing-story-copy" data-reveal>
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
              <div className="landing-story-visual" data-reveal>
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
            <div data-reveal>
              <dt>Dueño</dt>
              <dd>Precios, permisos, caja y auditoría del negocio.</dd>
            </div>
            <div data-reveal>
              <dt>Vendedor</dt>
              <dd>Ventas con PIN propio, stock, clientes y cotizaciones.</dd>
            </div>
            <div data-reveal>
              <dt>Técnico</dt>
              <dd>Recepción, diagnóstico, repuestos y entrega.</dd>
            </div>
          </dl>
          <p className="landing-small">
            Proveedor → inventario → venta → posventa. Cada movimiento, con su responsable.
          </p>
        </section>
        <section id="imei" className="landing-imei landing-container">
          <p className="landing-eyebrow">Antes de comprar o canjear</p>
          <h2 className="landing-section-title">Verifica un IMEI sin inventar un «limpio».</h2>
          <p className="landing-lead">
            Cada consulta se confirma antes de ejecutarse (sin cargos automáticos), queda auditada
            con fuente y hora, y los estados sin dato dicen «No verificado».
          </p>
          <div className="landing-imei-card" data-reveal>
            <ImeiVerificador />
          </div>
        </section>

        <section id="precio" className="landing-pricing landing-container" data-reveal>
          <div>
            <p className="landing-eyebrow">EMPEZÁ HOY</p>
            <h2>Conocé MobOS en tu tienda.</h2>
            <p>
              Explorá la demo y descubrí cómo MobOS conecta las ventas, el stock y los pedidos.
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
        <section className="landing-faq" data-reveal>
          <p className="landing-eyebrow">Preguntas rápidas</p>
          <h2 className="landing-section-title">Todo claro antes de empezar.</h2>
          <div className="landing-faq-list">
            {faqs.map(([q, a], i) => (
              <article
                key={q}
                className="landing-faq-item"
                data-open={open === i}
              >
                <button
                  onClick={() => setOpen(open === i ? -1 : i)}
                  aria-expanded={open === i}
                  aria-controls={`faq-respuesta-${i}`}
                  className="landing-faq-q"
                >
                  <b>{q}</b>
                  <ChevronDown className="landing-faq-chevron" size={19} />
                </button>
                {open === i && (
                  <p id={`faq-respuesta-${i}`} className="landing-faq-a">
                    {a}
                  </p>
                )}
              </article>
            ))}
          </div>
        </section>

        <section id="demo" className="landing-closing">
          <div className="landing-container" data-reveal>
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
            href="mailto:mobos@weem.com.py"
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
