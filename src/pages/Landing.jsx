import { ArrowRight, ArrowUpRight, ChevronDown, Menu, Store, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { publicUrls } from '@/lib/urls'
import ImeiVerificador from '@/components/landing/ImeiVerificador'
import CommercialPreview from '@/components/landing/CommercialPreview'
import CapacidadesMobOS from '@/components/landing/CapacidadesMobOS'
import ShowcaseMobOS from '@/components/landing/ShowcaseMobOS'
import SeccionMarca from '@/components/landing/SeccionMarca'
import useReveal from '@/components/landing/useReveal'
import ProductFooter from '@/components/app/ProductFooter'
import ThemeLogo from '@/components/app/ThemeLogo'
import ThemeToggle from '@/components/app/ThemeToggle'
import { temaV2Activo } from '@/lib/temaV2'
import './LandingEditorial.css'

// Landing editorial (rediseño desde cero): tipografía grande, una sola acción
// principal por pantalla, un único acento (verde MobOS) y vistas de producto
// dibujadas con el propio lenguaje de la app. Sin fotos de stock.

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

const roles = [
  ['Dueño', 'Precios, permisos, caja y auditoría del negocio.'],
  ['Vendedor', 'Ventas con PIN propio, stock, clientes y cotizaciones.'],
  ['Técnico', 'Recepción, diagnóstico, repuestos y entrega.'],
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
            <ThemeLogo className="h-7" />
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
            <a className="landing-nav-demo" href={`${app}/demo`}>
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
            className="landing-mobile-menu"
            onKeyDown={event => {
              if (event.key === 'Escape') {
                setMenu(false)
                document.querySelector('.landing-menu-toggle')?.focus()
              }
            }}
          >
            <div className="landing-container">
              <nav aria-label="Secciones">
                {NAV.map(([href, label], i) => (
                  <a key={href} href={href} onClick={() => setMenu(false)}>
                    <span aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                    {label}
                  </a>
                ))}
              </nav>
              <div className="landing-mobile-menu-actions">
                <a className="landing-button" href={`${app}/demo`}>
                  Probar la demo
                  <ArrowRight size={18} />
                </a>
                <a className="landing-secondary" href={`${app}/login`}>
                  Crear mi tienda
                </a>
              </div>
            </div>
          </div>
        )}
      </header>

      <main>
        {/* 1 · Portada: titular a todo el ancho y la operación dibujada debajo. */}
        <section id="inicio" className="landing-hero">
          <div className="landing-container">
            <p className="landing-eyebrow">EL SISTEMA PARA TU TIENDA DE TELÉFONOS</p>
            <h1 className="landing-hero-title landing-enter">
              <span>Vende teléfonos.</span>{' '}
              <span>
                No pierdas <em>el control.</em>
              </span>
            </h1>
            <div className="landing-hero-grid">
              <div className="landing-hero-copy landing-enter">
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
                    <ArrowUpRight size={16} />
                  </a>
                </div>
                <ol className="landing-hero-index" aria-label="Del mostrador a todo el negocio">
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
              <div className="landing-hero-stage landing-enter">
                <CommercialPreview />
              </div>
            </div>
          </div>
        </section>

        {/* 2 · Declaración: una sola frase, a lo ancho. */}
        <section className="landing-statement" aria-label="Una operación conectada">
          <div className="landing-container" data-reveal>
            <p>
              Del mostrador <strong>a todo el negocio.</strong>
            </p>
          </div>
        </section>

        {/* 3 · Capítulos: vender, controlar, cerrar. */}
        <section className="landing-chapters" aria-label="Vender, controlar y cerrar la operación">
          {stories.map(story => (
            <article id={story.id} key={story.id} className="landing-chapter">
              <div className="landing-container landing-chapter-grid">
                <div className="landing-chapter-copy" data-reveal>
                  <SeccionMarca numero={story.number} etiqueta={story.label} />
                  <h2>{story.title}</h2>
                  <p className="landing-lead">{story.description}</p>
                  <ol className="landing-chapter-points">
                    {story.points.map((point, i) => (
                      <li key={point}>
                        <span aria-hidden="true">
                          {story.number}.{i + 1}
                        </span>
                        {point}
                      </li>
                    ))}
                  </ol>
                  {story.id === 'cerrar' && (
                    <a
                      className="landing-secondary landing-portal-link"
                      href={`${app}/cuenta/demo-demo-cliente-lucia-rapido`}
                    >
                      Ver el portal de la demo
                      <ArrowUpRight size={16} />
                    </a>
                  )}
                </div>
                <div className="landing-chapter-visual" data-reveal>
                  <span className="landing-chapter-numeral" aria-hidden="true">
                    {story.number}
                  </span>
                  <CommercialPreview moment={story.moment} />
                </div>
              </div>
            </article>
          ))}
        </section>

        <CapacidadesMobOS />
        <ShowcaseMobOS />

        {/* 6 · Roles: una tabla, no tarjetas. */}
        <section className="landing-roles" aria-labelledby="roles-titulo">
          <div className="landing-container">
            <div className="landing-split-heading" data-reveal>
              <SeccionMarca numero="06" etiqueta="CADA PERSONA, SU RESPONSABILIDAD" />
              <h2 id="roles-titulo">
                Un equipo de trabajo.
                <br />
                El permiso justo para cada rol.
              </h2>
            </div>
            <dl className="landing-roles-table">
              {roles.map(([rol, detalle]) => (
                <div key={rol} data-reveal>
                  <dt>{rol}</dt>
                  <dd>{detalle}</dd>
                </div>
              ))}
            </dl>
            <p className="landing-small">
              Proveedor → inventario → venta → posventa. Cada movimiento, con su responsable.
            </p>
          </div>
        </section>

        {/* 7 · IMEI: la herramienta real, enmarcada. */}
        <section id="imei" className="landing-imei">
          <div className="landing-container">
            <div className="landing-split-heading" data-reveal>
              <SeccionMarca numero="07" etiqueta="Antes de comprar o canjear" />
              <h2 className="landing-section-title">Verifica un IMEI sin inventar un «limpio».</h2>
              <p className="landing-lead">
                Cada consulta se confirma antes de ejecutarse (sin cargos automáticos), queda
                auditada con fuente y hora, y los estados sin dato dicen «No verificado».
              </p>
            </div>
            <div className="landing-imei-card" data-reveal>
              <ImeiVerificador />
            </div>
          </div>
        </section>

        {/* 8 · Empezar: el único campo de color pleno de la página. */}
        <section id="precio" className="landing-pricing">
          <div className="landing-container landing-pricing-inner" data-reveal>
            <div>
              <p className="landing-eyebrow">EMPEZÁ HOY</p>
              <h2>Conocé MobOS en tu tienda.</h2>
              <p>
                Explorá la demo y descubrí cómo MobOS conecta las ventas, el stock y los pedidos.
              </p>
            </div>
            <div className="landing-hero-actions">
              <a className="landing-button landing-button--ink" href={`${app}/demo`}>
                Probar la demo
                <ArrowRight size={18} />
              </a>
              <a className="landing-secondary" href={`${app}/login`}>
                Crear mi tienda
              </a>
            </div>
          </div>
        </section>

        {/* 9 · Preguntas. */}
        <section className="landing-faq">
          <div className="landing-container landing-faq-grid">
            <div className="landing-split-heading" data-reveal>
              <SeccionMarca numero="09" etiqueta="Preguntas rápidas" />
              <h2 className="landing-section-title">Todo claro antes de empezar.</h2>
            </div>
            <div className="landing-faq-list" data-reveal>
              {faqs.map(([q, a], i) => (
                <article key={q} className="landing-faq-item" data-open={open === i}>
                  <button
                    onClick={() => setOpen(open === i ? -1 : i)}
                    aria-expanded={open === i}
                    aria-controls={`faq-respuesta-${i}`}
                    className="landing-faq-q"
                  >
                    <b>{q}</b>
                    <ChevronDown className="landing-faq-chevron" size={20} />
                  </button>
                  {open === i && (
                    <p id={`faq-respuesta-${i}`} className="landing-faq-a">
                      {a}
                    </p>
                  )}
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* 10 · Cierre: la demo, con los PIN a la vista. */}
        <section id="demo" className="landing-closing">
          <div className="landing-container" data-reveal>
            <p className="landing-eyebrow">CONOCE MOBOS POR DENTRO</p>
            <h2>
              Tu próxima venta.
              <br />
              Con todo en su lugar.
            </h2>
            <div className="landing-closing-grid">
              <div>
                <p>La demo real sigue disponible, con datos ficticios y sin registro.</p>
                <dl className="landing-pins" aria-label="PIN de la demo">
                  <div>
                    <dt>PIN 2001</dt>
                    <dd>vendedor</dd>
                  </div>
                  <div>
                    <dt>PIN 3001</dt>
                    <dd>dueño</dd>
                  </div>
                </dl>
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
          </div>
        </section>
      </main>
      <ProductFooter
        className="landing-footer mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-5 border-t-0 px-5 py-8 text-xs"
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
