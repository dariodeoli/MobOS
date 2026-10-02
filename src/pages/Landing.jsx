import {
  ArrowRight,
  BarChart3,
  BellRing,
  Check,
  ChevronDown,
  CircleDollarSign,
  Fingerprint,
  KeyRound,
  Menu,
  Package,
  Printer,
  ReceiptText,
  ScanLine,
  ShieldCheck,
  Store,
  Users,
  WifiOff,
  Wrench,
  X,
} from "lucide-react";
import { useState } from "react";
import { publicUrls } from "@/lib/urls";
import ImeiVerificador from "@/components/landing/ImeiVerificador";
import ProductFooter from '@/components/app/ProductFooter'
import ThemeLogo from '@/components/app/ThemeLogo'
import ThemeToggle from '@/components/app/ThemeToggle'
import { cn } from '@/lib/utils'
import { temaV2Activo } from '@/lib/temaV2'

// Landing reorganizada (#322): beneficio primero, evidencia verificable,
// tres pilares, el flujo proveedor → posventa, IMEI, roles, portal/impresión,
// precio transparente y cierre. Menos repetición y un solo recorrido.

const NAV = [
  ["#vender", "Vender"],
  ["#controlar", "Controlar"],
  ["#imei", "Verificación IMEI"],
  ["#precio", "Precio"],
  ["#demo", "Demo"],
];

const evidencias = [
  ["Cada venta, con su responsable", "PIN por vendedor, permisos por rol y auditoría de cada acción."],
  ["Stock por IMEI, no por cantidad", "Cada equipo con historial, ubicación, estado y reservas."],
  ["Plata conciliada", "Caja por turnos, medios por cuenta y comisiones liquidadas."],
  ["Servicio a la vista", "Estado público de API, base e impresión en moboss.online/status."],
];

const pilares = [
  {
    id: "vender",
    icono: ReceiptText,
    titulo: "Vender",
    bajada: "El mostrador rápido, con el control en la misma pantalla.",
    puntos: [
      "POS con carrito, descuentos y combos; búsqueda por nombre, modelo o IMEI.",
      "Cobros combinados (efectivo, transferencia, tarjeta, USDT), parciales y con saldo.",
      "Venta sin conexión: se guarda en el equipo y se envía sola al reconectar.",
      "Cotizaciones con enlace y Trade-In del equipo usado como parte de pago.",
    ],
  },
  {
    id: "controlar",
    icono: BarChart3,
    titulo: "Controlar",
    bajada: "Lo que entra, lo que sale y lo que queda, sin planillas paralelas.",
    puntos: [
      "Cada unidad con IMEI, ubicación, estado y cronología con fotos.",
      "Compras, recepción total o parcial e importación de productos.",
      "Caja por turnos, conciliación por cuenta y medio, y comisiones.",
      "Precios por lista y reportes de ventas, márgenes y stock.",
    ],
  },
  {
    id: "cerrar",
    icono: ShieldCheck,
    titulo: "Cerrar la operación",
    bajada: "La posventa también queda adentro: el cliente y el taller ven lo mismo.",
    puntos: [
      "Portal del cliente con link o QR: seguimiento, cuotas y garantías.",
      "Servicio técnico con recepción, repuestos, costos y entrega.",
      "Impresión térmica 58/80 mm y A4, con cola honesta y anti-duplicados.",
      "Garantías con estado y días restantes, y avisos por WhatsApp.",
    ],
  },
];

const flujo = [
  ["01", "Proveedor", "Compras, importación y recepción: el stock nace cuando el lote llega.", Package],
  ["02", "Inventario", "Cada IMEI con ubicación, estado y reservas; traslados entre sucursales con ETA.", ScanLine],
  ["03", "Venta", "POS con PIN, cobros combinados y caja del día en el mismo flujo.", CircleDollarSign],
  ["04", "Posventa", "Portal, garantías, taller e impresión salen de la misma orden.", ShieldCheck],
];

const roles = [
  ["Dueño", "Ve el negocio completo, define precios y permisos, cierra caja y revisa la auditoría.", Fingerprint],
  ["Vendedor", "Vende con su PIN, consulta stock y precios, y carga clientes y cotizaciones.", Users],
  ["Técnico", "Recibe equipos, diagnostica, cobra repuestos y entrega con aviso al cliente.", Wrench],
];

const faqs = [
  [
    "¿Puedo probar antes de crear una cuenta?",
    "Sí. La demo es una tienda de ejemplo, anónima y con datos ficticios: usá el PIN 2001 como vendedor o 3001 como dueño, sin instalar nada.",
  ],
  [
    "¿Cómo se verifica un IMEI?",
    "Desde la ficha del equipo (recepción, Trade-In o inventario) lanzás la consulta: blacklist, Find My/iCloud, SIM lock, MDM y garantía. Cada consulta se confirma antes de ejecutarse (sin cargos automáticos), queda auditada y, si falta un dato, el estado dice «No verificado», nunca un «limpio» inventado. En la demo se muestra con datos simulados.",
  ],
  [
    "¿Cada vendedor tiene su propio acceso?",
    "La tienda entra con un solo correo y cada vendedor abre su turno con un PIN de 4 a 6 dígitos. Cada venta queda a su nombre y su rol define qué puede ver y hacer.",
  ],
  [
    "¿Funciona sin internet?",
    "Sí. MobOS es una PWA instalable: la venta sigue disponible sin conexión, se guarda en el equipo y se sincroniza cuando vuelve la red.",
  ],
  [
    "¿Sirve para más de una sucursal?",
    "Sí. MobOS separa empresa, sucursal y ubicación física, con movimientos auditables entre locales y puentes de impresión por sucursal.",
  ],
];

function CapturaReal({ src, alt, className }) {
  return (
    <figure className={cn("overflow-hidden rounded-2xl border border-fore/10 bg-ink-800 shadow-[0_30px_90px_rgba(0,0,0,.35)]", className)}>
      <div className="flex h-9 items-center gap-2 border-b border-fore/10 bg-ink-700 px-4">
        <i className="h-2 w-2 rounded-full bg-bad" />
        <i className="h-2 w-2 rounded-full bg-warn" />
        <i className="h-2 w-2 rounded-full bg-fono" />
        <span className="ml-2 text-[10px] text-mute">app.moboss.online · demo</span>
      </div>
      <img src={src} alt={alt} className="block w-full" loading="lazy" />
      <figcaption className="border-t border-fore/10 px-4 py-2 text-[10px] text-mute">
        Captura real del producto · datos de la demo
      </figcaption>
    </figure>
  );
}

export default function Landing() {
  const [open, setOpen] = useState(0);
  const [menu, setMenu] = useState(false);
  const { app } = publicUrls;
  return (
    <div className={cn('min-h-dvh overflow-hidden bg-paper text-fore selection:bg-fono selection:text-onbrand', temaV2Activo() && 'tema-v2')}>
      <header className="sticky top-0 z-30 border-b border-fore/[.07] bg-paper/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-5 py-3.5">
          <a href="#inicio" aria-label="MobOS" className="toque-44">
            <ThemeLogo className="h-9" />
          </a>
          <nav className="hidden gap-6 text-sm text-mute lg:flex">
            {NAV.map(([href, label]) => (
              <a key={href} href={href} className="transition hover:text-fore">{label}</a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <a href={`${app}/login`} className="hidden min-h-11 items-center text-sm font-semibold text-mute transition hover:text-fono-dark sm:inline-flex">Ingresar</a>
            <ThemeToggle />
            <a
              href={`${app}/demo`}
              className="hidden min-h-11 items-center rounded-xl bg-fono px-4 text-sm font-bold text-onbrand shadow-glow transition hover:-translate-y-0.5 sm:inline-flex"
            >
              Probar demo
            </a>
            <button
              type="button"
              onClick={() => setMenu((valor) => !valor)}
              aria-expanded={menu}
              aria-controls="menu-movil"
              aria-label={menu ? 'Cerrar menú' : 'Abrir menú'}
              className="grid h-11 w-11 place-items-center rounded-xl border border-fore/15 text-fore lg:hidden"
            >
              {menu ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>
        {menu && (
          <div id="menu-movil" className="border-t border-fore/[.07] bg-paper px-5 py-4 lg:hidden">
            <nav aria-label="Secciones" className="grid gap-1">
              {NAV.map(([href, label]) => (
                <a
                  key={href}
                  href={href}
                  onClick={() => setMenu(false)}
                  className="flex min-h-11 items-center rounded-xl px-3 text-sm font-semibold text-mute transition hover:bg-fore/5 hover:text-fore"
                >
                  {label}
                </a>
              ))}
            </nav>
            <div className="mt-3 grid gap-2">
              <a href={`${app}/demo`} className="flex min-h-11 items-center justify-center rounded-xl bg-fono px-4 font-bold text-onbrand">Probar la demo</a>
              <a href={`${app}/login`} className="flex min-h-11 items-center justify-center rounded-xl border border-fore/15 px-4 font-semibold">Crear mi tienda</a>
            </div>
          </div>
        )}
      </header>

      <main>
        {/* 1 · Hero + captura real */}
        <section id="inicio" className="relative isolate overflow-hidden">
          <i className="absolute left-[6%] top-8 -z-10 h-80 w-80 rounded-full bg-fono/10 blur-[110px]" />
          <i className="absolute right-[-8%] top-40 -z-10 h-96 w-96 rounded-full bg-fono-glow/20 blur-[120px]" />
          <div className="mx-auto grid max-w-7xl gap-14 px-5 pb-20 pt-16 lg:grid-cols-[.92fr_1.08fr] lg:items-center lg:py-24">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="inline-flex items-center gap-2 rounded-full border border-fono/25 bg-fono/[.08] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[.16em] text-fono-dark">
                  <span className="h-1.5 w-1.5 rounded-full bg-fono" />
                  Operación completa para tiendas móviles
                </p>
                <p className="inline-flex items-center gap-1.5 rounded-full border border-fore/15 bg-ink px-3 py-1.5 text-[11px] font-semibold text-mute">
                  <WifiOff size={12} className="text-fono-dark" />
                  PWA · funciona sin conexión
                </p>
              </div>
              <h1 className="mt-6 font-display text-5xl font-bold leading-[.91] tracking-[-.065em] sm:text-6xl lg:text-7xl">
                Vendé más rápido.
                <br />
                <span className="text-fono-dark">Controlá todo el negocio.</span>
              </h1>
              <p className="mt-7 max-w-xl text-lg leading-8 text-mute">
                Del proveedor al inventario, de la venta a la posventa: stock por
                IMEI, caja, clientes, taller y portal del cliente en un solo
                sistema, con cada movimiento auditable.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <a
                  href={`${app}/demo`}
                  className="inline-flex min-h-11 items-center rounded-xl bg-fono px-5 py-3.5 font-bold text-onbrand shadow-glow transition hover:-translate-y-0.5"
                >
                  Probar la demo (sin registro)
                  <ArrowRight className="ml-1 inline" size={18} />
                </a>
                <a
                  href={`${app}/login`}
                  className="inline-flex min-h-11 items-center rounded-xl border border-fore/15 px-5 py-3.5 font-semibold transition hover:border-fono-dark/50 hover:text-fono-dark"
                >
                  Crear mi tienda
                </a>
              </div>
              <p className="mt-7 text-xs text-mute">
                <Check className="mr-1 inline text-fono-dark" size={14} /> USD
                10 / mes <span className="mx-3">·</span>
                <Check className="mr-1 inline text-fono-dark" size={14} /> Sin
                permanencia <span className="mx-3">·</span>
                <Check className="mr-1 inline text-fono-dark" size={14} />{" "}
                Correo o Google
              </p>
            </div>
            <CapturaReal
              src="/landing/panel.png"
              alt="Panel de MobOS: resumen del día con ventas, caja, stock y verificación de IMEI"
            />
          </div>
        </section>

        {/* 2 · Evidencia verificable y seguridad */}
        <section className="border-y border-fore/[.07] bg-fore/[.018]">
          <div className="mx-auto max-w-7xl px-5 py-12">
            <p className="text-xs font-bold uppercase tracking-[.2em] text-fono-dark">Evidencia verificable</p>
            <h2 className="mt-3 max-w-2xl font-display text-3xl font-bold tracking-[-.04em] sm:text-4xl">
              Seguridad y control que se pueden comprobar.
            </h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {evidencias.map(([t, d]) => (
                <div key={t} className="rounded-2xl border border-fore/[.08] bg-ink p-4 shadow-card">
                  <b className="block font-display text-sm">{t}</b>
                  <p className="mt-1.5 text-xs leading-5 text-mute">{d}</p>
                </div>
              ))}
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-3 text-sm text-mute">
              <span className="inline-flex items-center gap-2"><KeyRound size={15} className="text-fono-dark" />Un acceso de tienda y PIN por persona.</span>
              <span className="inline-flex items-center gap-2"><BellRing size={15} className="text-fono-dark" />Auditoría con la persona real detrás de cada acción.</span>
            </div>
          </div>
        </section>

        {/* 3 · Tres pilares */}
        <section className="mx-auto max-w-7xl px-5 py-20">
          <p className="text-xs font-bold uppercase tracking-[.2em] text-fono-dark">Una base para toda la operación</p>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-5">
            <h2 className="max-w-2xl font-display text-4xl font-bold tracking-[-.04em] sm:text-5xl">
              Vender · Controlar · Cerrar la operación.
            </h2>
            <p className="max-w-sm text-sm leading-6 text-mute">
              Los tres momentos de la tienda comparten los mismos datos: lo que
              se vende, lo que queda y lo que vuelve por garantía.
            </p>
          </div>
          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            {pilares.map(({ id, icono: Icono, titulo, bajada, puntos }) => (
              <article key={id} id={id} className="scroll-mt-24 rounded-2xl border border-fore/[.08] bg-ink p-6 shadow-card">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-fono/10 text-fono-dark">
                  <Icono size={19} />
                </span>
                <h3 className="mt-4 font-display text-xl font-bold">{titulo}</h3>
                <p className="mt-1.5 text-sm text-mute">{bajada}</p>
                <ul className="mt-4 space-y-2.5">
                  {puntos.map((punto) => (
                    <li key={punto} className="flex gap-2.5 text-sm text-mute">
                      <Check size={15} className="mt-0.5 shrink-0 text-fono-dark" />
                      {punto}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        {/* 4 · Flujo proveedor → posventa */}
        <section className="border-y border-fore/[.07] bg-ink-800/60">
          <div className="mx-auto max-w-7xl px-5 py-20">
            <p className="text-xs font-bold uppercase tracking-[.2em] text-fono-dark">El flujo que ordena la tienda</p>
            <h2 className="mt-4 max-w-2xl font-display text-4xl font-bold tracking-[-.04em] sm:text-5xl">
              Del proveedor a la posventa, sin saltos de sistema.
            </h2>
            <div className="mt-10 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              {flujo.map(([n, t, d, Icono]) => (
                <article key={n} className="rounded-2xl border border-fore/[.08] bg-ink p-5 shadow-card">
                  <div className="flex items-center justify-between">
                    <b className="text-sm text-fono-dark">{n}</b>
                    <span className="grid h-9 w-9 place-items-center rounded-xl bg-fono/10 text-fono-dark"><Icono size={17} /></span>
                  </div>
                  <b className="mt-3 block">{t}</b>
                  <p className="mt-1 text-sm text-mute">{d}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* 5 · Verificación IMEI */}
        <section id="imei" className="mx-auto max-w-7xl scroll-mt-20 px-5 py-20">
          <p className="text-xs font-bold uppercase tracking-[.2em] text-fono-dark">Antes de comprar o canjear</p>
          <h2 className="mt-3 max-w-2xl font-display text-4xl font-bold tracking-[-.04em] sm:text-5xl">
            Verificá un IMEI sin inventar un «limpio».
          </h2>
          <p className="mt-4 max-w-2xl leading-7 text-mute">
            Cada consulta se confirma antes de ejecutarse (sin cargos
            automáticos), queda auditada con fuente y hora, y los estados sin
            dato dicen «No verificado».
          </p>
          <div className="mt-8">
            <ImeiVerificador />
          </div>
        </section>

        {/* 6 · Beneficios por rol */}
        <section className="border-y border-fore/[.07] bg-fore/[.018]">
          <div className="mx-auto max-w-7xl px-5 py-20">
            <p className="text-xs font-bold uppercase tracking-[.2em] text-fono-dark">Cada uno con su acceso</p>
            <h2 className="mt-4 max-w-2xl font-display text-4xl font-bold tracking-[-.04em] sm:text-5xl">
              El equipo trabaja con el permiso justo.
            </h2>
            <div className="mt-10 grid gap-4 lg:grid-cols-3">
              {roles.map(([rol, detalle, Icono]) => (
                <article key={rol} className="rounded-2xl border border-fore/[.08] bg-ink p-6 shadow-card">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-fono/10 text-fono-dark"><Icono size={19} /></span>
                  <h3 className="mt-4 font-bold">{rol}</h3>
                  <p className="mt-1.5 text-sm leading-6 text-mute">{detalle}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* 7 · Portal del cliente, impresión y offline con captura real */}
        <section id="portal" className="mx-auto grid max-w-7xl scroll-mt-20 gap-12 px-5 py-20 lg:grid-cols-[1fr_.95fr] lg:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.2em] text-fono-dark">Cerrar la operación</p>
            <h2 className="mt-4 font-display text-4xl font-bold tracking-[-.04em] sm:text-5xl">
              Tu cliente ve lo mismo que vos.
            </h2>
            <p className="mt-6 leading-7 text-mute">
              Cada pedido tiene su link o QR: seguimiento, saldo y cuotas,
              garantías y comprobantes, sin que el cliente cree una cuenta. La
              tienda deja de responder «¿ya está?» por teléfono.
            </p>
            <ul className="mt-6 space-y-3 text-sm text-mute">
              <li className="flex gap-3"><Printer size={16} className="mt-0.5 shrink-0 text-fono-dark" />Térmicas de 58/80 mm y A4, con cola que muestra pendientes y reintentos.</li>
              <li className="flex gap-3"><ScanLine size={16} className="mt-0.5 shrink-0 text-fono-dark" />Etiquetas de góndola y de unidad, y comprobantes anti-duplicados.</li>
              <li className="flex gap-3"><WifiOff size={16} className="mt-0.5 shrink-0 text-fono-dark" />Sin conexión, la venta se guarda en el equipo y se envía al reconectar.</li>
            </ul>
            <a
              href={`${app}/cuenta/demo-demo-cliente-lucia-rapido`}
              className="mt-8 inline-flex min-h-11 items-center rounded-xl bg-fono px-5 py-3 font-bold text-onbrand shadow-glow transition hover:-translate-y-0.5"
            >
              Ver el portal de la demo
              <ArrowRight className="ml-1 inline" size={17} />
            </a>
          </div>
          <CapturaReal
            src="/landing/portal.png"
            alt="Cuenta del cliente en MobOS: seguimiento del pedido, cuotas y garantía"
            className="mx-auto w-full max-w-[320px]"
          />
        </section>

        {/* 8 · Precio, FAQ y cierre */}
        <section id="precio" className="mx-auto max-w-7xl scroll-mt-20 px-5 pb-20">
          <div className="grid gap-10 overflow-hidden rounded-[2rem] border border-fono/30 bg-blue-line p-8 text-onbrand md:grid-cols-[1fr_auto] md:items-center sm:p-12">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.2em] text-onbrand/85">
                Un plan, operación completa
              </p>
              <h2 className="mt-4 font-display text-4xl font-bold tracking-[-.05em] sm:text-5xl">
                USD 10 por mes, sin permanencia.
              </h2>
              <ul className="mt-6 grid max-w-xl gap-2 text-sm text-onbrand/90">
                <li className="flex gap-2.5"><Check size={15} className="mt-0.5 shrink-0" />Tu equipo completo: acceso de tienda y PIN por vendedor.</li>
                <li className="flex gap-2.5"><Check size={15} className="mt-0.5 shrink-0" />Sucursales: multi-sucursal con puentes de impresión por local.</li>
                <li className="flex gap-2.5"><Check size={15} className="mt-0.5 shrink-0" />Hardware: ticketeras 58/80 mm y A4 (o el puente USB del agente).</li>
                <li className="flex gap-2.5"><Check size={15} className="mt-0.5 shrink-0" />Actualizaciones y soporte incluidos.</li>
              </ul>
            </div>
            <div className="rounded-2xl bg-ink p-6 text-fore shadow-2xl">
              <span className="text-sm font-bold text-fono-dark">USD</span>
              <strong className="ml-2 text-6xl tracking-[-.08em]">10</strong>
              <span className="ml-2 text-sm text-mute">/ mes</span>
              <a href={`${app}/login`} className="mt-5 flex min-h-11 items-center justify-center rounded-xl bg-fono px-5 py-3 font-bold text-onbrand transition hover:-translate-y-0.5">
                Crear mi tienda
              </a>
              <a href={`${app}/demo`} className="mt-2 flex min-h-11 items-center justify-center rounded-xl border border-fore/15 px-5 py-3 font-semibold transition hover:border-fono-dark/50 hover:text-fono-dark">
                Probar la demo
              </a>
              <p className="mt-3 text-center text-xs text-mute">
                Sin contratos · soporte incluido
              </p>
            </div>
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
              <article key={q} className="overflow-hidden rounded-2xl border border-fore/[.08] bg-ink shadow-card">
                <button
                  onClick={() => setOpen(open === i ? -1 : i)}
                  aria-expanded={open === i}
                  aria-controls={`faq-respuesta-${i}`}
                  className="flex min-h-11 w-full items-center justify-between gap-4 p-5 text-left"
                >
                  <b className="text-sm sm:text-base">{q}</b>
                  <ChevronDown
                    className={`shrink-0 text-fono-dark transition ${open === i ? "rotate-180" : ""}`}
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

        <section id="demo" className="scroll-mt-20 border-t border-fore/[.07] bg-ink-800/60">
          <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 px-5 py-12 md:flex-row md:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.2em] text-fono-dark">
                Probalo antes de decidir
              </p>
              <h2 className="mt-2 font-display text-3xl font-bold">
                Entrá a una tienda demo y recorré el flujo.
              </h2>
              <p className="mt-2 text-sm text-mute">
                <b className="font-mono text-fono-dark">2001</b> vendedor ·{" "}
                <b className="font-mono text-fono-dark">3001</b> dueño · datos
                ficticios, sin registro y sin gastar nada
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <a href={`${app}/demo`} className="inline-flex min-h-11 items-center rounded-xl bg-fono px-5 py-3.5 font-bold text-onbrand shadow-glow transition hover:-translate-y-0.5">
                Probar la demo <ArrowRight className="ml-1 inline" size={18} />
              </a>
              <a href={`${app}/login`} className="inline-flex min-h-11 items-center rounded-xl border border-fore/15 px-5 py-3.5 font-semibold transition hover:border-fono-dark/50 hover:text-fono-dark">
                Crear mi tienda
              </a>
            </div>
          </div>
        </section>
      </main>

      <ProductFooter
        className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-5 border-t-0 px-5 py-8 text-xs"
        leading={<span className="flex items-center gap-2">
          <Store size={14} className="text-fono-dark" />
          <b className="text-fore">MobOS</b>
        </span>}
      >
        <span className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
          <a className="inline-flex min-h-11 min-w-11 items-center justify-center px-2 transition hover:text-fono-dark" href="mailto:soporte@moboss.online">Soporte</a>
          <a className="inline-flex min-h-11 min-w-11 items-center justify-center px-2 transition hover:text-fono-dark" href="/status">Estado</a>
          <a className="inline-flex min-h-11 min-w-11 items-center justify-center px-2 transition hover:text-fono-dark" href="/privacidad">Privacidad</a>
          <a className="inline-flex min-h-11 min-w-11 items-center justify-center px-2 transition hover:text-fono-dark" href="/terminos">Términos</a>
        </span>
      </ProductFooter>
    </div>
  );
}
