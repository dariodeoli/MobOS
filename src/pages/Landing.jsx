import {
  ArrowRight,
  BarChart3,
  BellRing,
  Check,
  ChevronDown,
  CircleDollarSign,
  CreditCard,
  Fingerprint,
  KeyRound,
  Package,
  Printer,
  ReceiptText,
  ScanLine,
  ShieldCheck,
  Smartphone,
  Store,
  Users,
  WifiOff,
  Wrench,
} from "lucide-react";
import { useState } from "react";
import { publicUrls } from "@/lib/urls";
import CapturaModulo from "@/components/landing/CapturaModulo";
import ImeiVerificador from "@/components/landing/ImeiVerificador";
import ProductFooter from '@/components/app/ProductFooter'
import ThemeLogo from '@/components/app/ThemeLogo'
import ThemeToggle from '@/components/app/ThemeToggle'
import { GRILLA_DOS_COLUMNAS } from '@/components/shared/formulario'
import { cn } from '@/lib/utils'
import { temaV2Activo } from '@/lib/temaV2'

const novedades = [
  ["POS completo", "Carrito, cobros combinados y venta sin conexión.", ReceiptText],
  ["CRM + portal", "Ficha 360° y portal del cliente con link o QR.", Users],
  ["Verificación de IMEI", "Lista negra, Find My, SIM lock y garantía.", ScanLine],
  ["Impresión y multi-puente", "Cola honesta, USB directo y puentes por sucursal.", Printer],
];

const modulos = [
  {
    tipo: "pos",
    titulo: "POS completo",
    detalle: "Carrito en el panel, tablero del día, descuentos, combos y promociones. Cobros combinados (efectivo, transferencia, tarjeta, USDT), pagos parciales, saldo con plazo y borradores compartibles con un link.",
    Icono: ReceiptText,
  },
  {
    tipo: "crm",
    titulo: "Cliente 360° (mini-CRM)",
    detalle: "Búsqueda instantánea, deuda por pedido, garantías, cronología, analítica, notas internas, WhatsApp con plantillas y campañas de recompra.",
    Icono: Users,
  },
  {
    tipo: "finanzas",
    titulo: "Finanzas, caja y conciliación",
    detalle: "Cuentas y medios de cobro con banco y descuento, turnos de caja con arqueo por denominación, conciliación por cuenta, medio y procesadora, y comisiones liquidadas.",
    Icono: CreditCard,
  },
  {
    tipo: "inventario",
    titulo: "Inventario por IMEI",
    detalle: "Historial por unidad, condiciones y ubicaciones, reservas con cliente, transferencias entre sucursales, conteos auditables y etiquetas QR con código de barras.",
    Icono: ScanLine,
  },
  {
    tipo: "servicio",
    titulo: "Servicio técnico y garantías",
    detalle: "Recepción con fotos y checklist, técnico asignado, costos desglosados, reingreso al stock y garantía con estado y días restantes.",
    Icono: Wrench,
  },
  {
    tipo: "portal",
    titulo: "Portal del cliente",
    detalle: "Cada pedido tiene su link o QR: seguimiento, cuenta y cuotas, garantías y comprobantes, sin que el cliente instale nada ni cree una cuenta.",
    Icono: Store,
  },
  {
    tipo: "impresion",
    titulo: "Impresión de verdad",
    detalle: "Térmicas y A4, cola con estados y cancelación, anti-duplicados, prueba que se confirma con el código del papel y puentes por sucursal con USB directo.",
    Icono: Printer,
  },
  {
    tipo: "offline",
    titulo: "Funciona sin internet",
    detalle: "PWA instalable con venta offline: la operación se guarda en el equipo, se envía sola al reconectar y el catálogo queda disponible.",
    Icono: WifiOff,
  },
  {
    tipo: "imei",
    titulo: "Verificación de IMEI",
    detalle: "Antes de recibir o canjear un equipo: blacklist actual e historial Pro, Find My/iCloud, SIM lock, MDM y garantía, con fuente, hora y auditoría de cada consulta.",
    Icono: ShieldCheck,
    enlace: "#imei",
  },
];

const pasos = [
  [
    "01",
    "Abrí el POS con PIN",
    "Cada venta, descuento y comisión queda a nombre de quien la hizo.",
    Fingerprint,
  ],
  [
    "02",
    "Encontrá lo que necesitás",
    "Clientes, productos por modelo/capacidad/color, IMEI y compatibilidades, con escáner.",
    Smartphone,
  ],
  [
    "03",
    "Cobrá sin forzar el pago",
    "Total, pendiente, reserva o pagos divididos entre varias cuentas y monedas.",
    CircleDollarSign,
  ],
  [
    "04",
    "Seguimiento listo",
    "Stock, cliente, garantía, portal e impresión se actualizan desde la misma orden.",
    ShieldCheck,
  ],
];

const accesos = [
  [
    "Un solo acceso de tienda",
    "La tienda entra con su correo (Gmail) o con Google. Sin una cuenta por persona.",
  ],
  [
    "PIN de 4 a 6 dígitos por vendedor",
    "Identifica quién vendió y define qué puede ver y hacer cada uno (roles y matriz de permisos).",
  ],
  [
    "Cambio de vendedor y bloqueo",
    "Se pasa de un vendedor a otro sin cerrar sesión; bloqueo de sesión por inactividad con PIN.",
  ],
];

const faqs = [
  [
    "¿Puedo probar antes de crear una cuenta?",
    "Sí. La demo es una tienda de ejemplo, anónima y con datos ficticios: usá el PIN 2001 como vendedor o 3001 como dueño, sin instalar nada.",
  ],
  [
    "¿Cómo se verifica un IMEI?",
    "En la ficha del equipo (recepción, Trade-In o inventario) lanzás la consulta y ves blacklist actual e historial, Find My/iCloud, SIM lock, MDM y garantía con fuente y hora. Cada consulta se confirma antes de ejecutarse (sin cargos automáticos), es idempotente y queda auditada; si el resultado es pendiente, parcial o sin dato, el estado es «No verificado», nunca un «limpio» inventado.",
  ],
  [
    "¿La verificación de IMEI ya está disponible?",
    "Ya está la Fase 1 en modo mock: valida el IMEI (15 dígitos y dígito control), usa estados honestos y registra cada consulta con costo confirmado, sin llamadas reales al proveedor salvo configuración explícita. En la demo se muestra simulada con datos ficticios, misma ficha y mismo formato.",
  ],
  [
    "¿Cada vendedor tiene su propio acceso?",
    "Sí. La tienda entra con un solo correo y cada vendedor abre su turno con un PIN de 4 dígitos. Cada venta queda a su nombre y sus permisos definidos.",
  ],
  [
    "¿Funciona sin internet?",
    "Sí. MobOS es una PWA instalable: la operación sigue disponible sin conexión (la venta se guarda en el equipo) y se sincroniza cuando vuelve la red.",
  ],
  [
    "¿Cómo cargo productos por IMEI?",
    "Al crear el producto elegís manejo por IMEI o serial. Cargás unidades una a una o en lote (con costo en Gs o USD y cotización) y quedan con historial, etiqueta y QR.",
  ],
  [
    "¿Sirve para más de una sucursal?",
    "Sí. MobOS separa empresa, sucursal y ubicación física, con movimientos auditables entre locales y puentes de impresión por sucursal.",
  ],
  [
    "¿Puedo cobrar con varios medios?",
    "Sí. Una orden puede quedar pendiente, pagarse por partes o combinar efectivo, transferencia, POS y otros métodos configurados.",
  ],
];

function Preview({ appDomain }) {
  return (
    <div className="relative mx-auto max-w-[620px] rounded-[2rem] border border-fore/10 bg-ink-800 p-3 shadow-[0_30px_90px_rgba(0,0,0,.42)]">
      <div className="flex h-9 items-center gap-2 rounded-t-[1.35rem] bg-ink-700 px-4 text-[10px] text-mute">
        <i className="h-2 w-2 rounded-full bg-bad" />
        <i className="h-2 w-2 rounded-full bg-warn" />
        <i className="h-2 w-2 rounded-full bg-fono" />
        <span className="ml-3 rounded bg-fore/5 px-2 py-1">
          {appDomain.replace("https://", "")}
        </span>
      </div>
      <div className="grid min-h-[355px] grid-cols-[76px_1fr] overflow-hidden rounded-b-[1.35rem] bg-paper sm:grid-cols-[118px_1fr]">
        <aside className="border-r border-fore/5 bg-ink-800 px-2 py-4 sm:px-3">
          <b className="mb-7 hidden text-xs text-fono-dark sm:block">MOBOS</b>
          {["Resumen", "Ventas", "Pedidos", "Inventario", "Finanzas", "Clientes"].map(
            (x, i) => (
              <div
                key={x}
                className={`mb-1 rounded-lg px-2 py-2 text-[10px] sm:text-xs ${i === 1 ? "bg-fono/12 text-fono-dark" : "text-mute"}`}
              >
                {x}
              </div>
            ),
          )}
        </aside>
        <div className="p-4 sm:p-6">
          <div className="flex justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[.18em] text-fono-dark">
                Viernes, 12 de septiembre
              </p>
              <h3 className="mt-1 text-base font-bold sm:text-xl">
                Buenos días, Dario
              </h3>
            </div>
            <div className="flex flex-col items-end gap-1">
              <b className="rounded-lg bg-fono/10 px-2 py-1 text-[10px] text-fono-dark">
                ASU · EN VIVO
              </b>
              <b className="rounded-lg bg-fore/[.06] px-2 py-1 text-[10px] text-mute">
                PIN · 2001
              </b>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <Stat
              label="Ventas de hoy"
              value="Gs. 12.840.500"
              detail="↑ 18,4% vs. ayer"
            />
            <Stat
              label="Caja disponible"
              value="Gs. 4.920.000"
              detail="3 cuentas activas"
            />
          </div>
          <div className="mt-4 rounded-xl border border-fore/10 bg-fore/[.025] p-3">
            <div className="flex justify-between text-xs">
              <b>Movimiento semanal</b>
              <span className="text-mute">últimos 7 días</span>
            </div>
            <div className="mt-4 flex h-20 items-end gap-1.5">
              {[36, 57, 45, 72, 52, 88, 70, 96, 80, 64, 100].map((n, i) => (
                <i
                  key={i}
                  style={{ height: `${n}%` }}
                  className="flex-1 rounded-t bg-gradient-to-t from-fono-dark/70 to-fono"
                />
              ))}
            </div>
          </div>
          <div className={cn('mt-4', GRILLA_DOS_COLUMNAS)}>
            <div className="flex gap-3 rounded-xl bg-fono/10 p-3">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-fono text-onbrand">
                <Package size={14} />
              </span>
              <p className="text-[10px] text-fore/80">
                <b className="text-fore">4 productos</b> necesitan reposición esta semana.
              </p>
            </div>
            <div className="flex gap-3 rounded-xl border border-fore/10 p-3">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-ok/15 text-ok">
                <ShieldCheck size={14} />
              </span>
              <p className="text-[10px] text-fore/80">
                <b className="text-fore">IMEI verificado:</b> sin reportes · Find My desactivado.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, detail }) {
  return (
    <div className="rounded-xl border border-fore/10 bg-fore/[.035] p-3">
      <p className="text-[10px] text-mute">{label}</p>
      <b className="mt-1 block text-base sm:text-xl">{value}</b>
      <span className="text-[10px] text-fono-dark">{detail}</span>
    </div>
  );
}

function MockPortal() {
  return (
    <div className="mx-auto w-full max-w-[300px] rounded-[2rem] border border-fore/15 bg-ink-800 p-3 shadow-[0_24px_70px_rgba(0,0,0,.35)]">
      <div className="mx-auto mb-3 h-1 w-16 rounded-full bg-fore/15" />
      <div className="space-y-2 rounded-[1.35rem] bg-paper p-3 text-fore">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[.18em] text-fono-dark">Seguimiento</p>
            <b className="font-display text-lg">MOB-0042</b>
          </div>
          <span className="rounded-lg border border-ok/30 bg-ok/10 px-2 py-1 text-[9px] font-bold uppercase text-ok">Pagado</span>
        </div>
        <div className="rounded-xl border border-fore/10 p-2.5 text-[10px]">
          <p className="text-mute">Pendiente</p>
          <b className="text-sm tabular-nums text-warn">Gs 0</b>
          <div className="mt-2 flex gap-1">
            {["En preparación", "En camino", "Entregado"].map((etapa, i) => (
              <span key={etapa} className={`h-1.5 flex-1 rounded-full ${i < 3 ? "bg-fono" : "bg-fore/10"}`} />
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-fore/10 p-2.5 text-[10px]">
          <p className="flex items-center justify-between"><span className="text-mute">Cuotas</span><b>3 de 6 · al día</b></p>
          <p className="mt-1 flex items-center justify-between"><span className="text-mute">Garantía</span><b>Vigente · 8 meses</b></p>
        </div>
        <div className="flex items-center justify-between rounded-xl bg-fono/10 px-2.5 py-2 text-[10px] text-fono-dark">
          <span>Comprobante y notas</span>
          <ArrowRight size={13} />
        </div>
      </div>
    </div>
  );
}

export default function Landing() {
  const [open, setOpen] = useState(0);
  const { app } = publicUrls;
  return (
    <div className={cn('min-h-dvh overflow-hidden bg-paper text-fore selection:bg-fono selection:text-onbrand', temaV2Activo() && 'tema-v2')}>
      <header className="sticky top-0 z-30 border-b border-fore/[.07] bg-paper/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3.5">
          <a href="#inicio" aria-label="MobOS" className="toque-44">
            <ThemeLogo className="h-9" />
          </a>
          <nav className="hidden gap-6 text-sm text-mute lg:flex">
            <a href="#modulos" className="transition hover:text-fore">Módulos</a>
            <a href="#imei" className="transition hover:text-fore">Verificación IMEI</a>
            <a href="#portal" className="transition hover:text-fore">Portal</a>
            <a href="#demo" className="transition hover:text-fore">Demo</a>
            <a href="#precio" className="transition hover:text-fore">Precio</a>
          </nav>
          <div className="flex items-center gap-2">
            <a href="/status" className="hidden text-sm font-semibold text-mute transition hover:text-fono-dark sm:block">Estado</a>
            <ThemeToggle />
            <a
              href={`${app}/demo`}
              className="inline-flex min-h-11 items-center rounded-xl bg-fono px-4 py-2 text-sm font-bold text-onbrand shadow-glow transition hover:-translate-y-0.5"
            >
              Probar demo
            </a>
          </div>
        </div>
      </header>
      <main>
        <section id="inicio" className="relative isolate overflow-hidden">
          <i className="absolute left-[6%] top-8 -z-10 h-80 w-80 rounded-full bg-fono/10 blur-[110px]" />
          <i className="absolute right-[-8%] top-40 -z-10 h-96 w-96 rounded-full bg-fono-glow/20 blur-[120px]" />
          <div className="mx-auto grid max-w-7xl gap-14 px-5 pb-20 pt-16 lg:grid-cols-[.9fr_1.1fr] lg:items-center lg:py-24">
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
                Vendé con PIN.
                <br />
                <span className="text-fono-dark">Controlá todo el negocio.</span>
              </h1>
              <p className="mt-7 max-w-xl text-lg leading-8 text-mute">
                POS con PIN único, inventario por IMEI, compras e importaciones,
                caja y finanzas, cliente 360°, servicio técnico, portal del
                cliente y verificación de IMEI. Desde que entra un equipo hasta
                la posventa, todo queda vinculado, impreso y auditado.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <a
                  href={`${app}/demo`}
                  className="rounded-xl bg-fono px-5 py-3.5 font-bold text-onbrand shadow-glow transition hover:-translate-y-0.5"
                >
                  Probar el demo{" "}
                  <ArrowRight className="ml-1 inline" size={18} />
                </a>
                <a
                  href={`${app}/login`}
                  className="rounded-xl border border-fore/15 px-5 py-3.5 font-semibold transition hover:border-fono-dark/50 hover:text-fono-dark"
                >
                  Entrar
                </a>
              </div>
              <p className="mt-7 text-xs text-mute">
                <Check className="mr-1 inline text-fono-dark" size={14} /> USD
                10 / mes <span className="mx-3">·</span>
                <Check className="mr-1 inline text-fono-dark" size={14} /> Sin
                contratos <span className="mx-3">·</span>
                <Check className="mr-1 inline text-fono-dark" size={14} />{" "}
                Correo o Google
              </p>
            </div>
            <Preview appDomain={app} />
          </div>
        </section>
        <section className="border-y border-fore/[.07] bg-fore/[.018]">
          <div className="mx-auto grid max-w-7xl gap-4 px-5 py-6 sm:grid-cols-2 lg:grid-cols-4">
            {novedades.map(([t, d, I]) => (
              <div key={t} className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-fono/10 text-fono-dark">
                  <I size={17} />
                </span>
                <p className="text-xs leading-5 text-mute">
                  <b className="block font-display text-sm text-fore">{t}</b>
                  {d}
                </p>
              </div>
            ))}
          </div>
        </section>
        <section id="imei" className="mx-auto max-w-7xl scroll-mt-20 px-5 py-24">
          <ImeiVerificador />
        </section>
        <section id="operacion" className="mx-auto max-w-7xl scroll-mt-20 px-5 pb-24">
          <div className="grid gap-12 lg:grid-cols-[.85fr_1.15fr] lg:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.2em] text-fono-dark">
                El flujo que ordena la tienda
              </p>
              <h2 className="mt-4 font-display text-4xl font-bold tracking-[-.04em] sm:text-5xl">
                Hecho para vender rápido, no para llenar formularios.
              </h2>
              <p className="mt-6 leading-7 text-mute">
                El vendedor se identifica con PIN y el sistema ya sabe quién
                vende. Busca al cliente, encuentra el producto, verifica el
                equipo si hace falta y cobra como corresponda.
              </p>
            </div>
            <div className="grid gap-3">
              {pasos.map(([n, t, d, I]) => (
                <article
                  key={n}
                  className="flex gap-4 rounded-2xl border border-fore/[.08] bg-ink p-5 shadow-card transition hover:-translate-y-0.5 hover:border-fono/40"
                >
                  <b className="text-sm text-fono-dark">{n}</b>
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-fono/10 text-fono-dark">
                    <I size={19} />
                  </span>
                  <span>
                    <b className="block text-sm">{t}</b>
                    <p className="mt-1 text-sm text-mute">{d}</p>
                  </span>
                </article>
              ))}
            </div>
          </div>
        </section>
        <section
          id="modulos"
          className="scroll-mt-20 border-y border-fore/[.07] bg-ink-800/60"
        >
          <div className="mx-auto max-w-7xl px-5 py-24">
            <p className="text-xs font-bold uppercase tracking-[.2em] text-fono-dark">
              Una base para toda la operación
            </p>
            <div className="mt-4 flex flex-wrap items-end justify-between gap-5">
              <h2 className="max-w-2xl font-display text-4xl font-bold tracking-[-.04em] sm:text-5xl">
                Todo el recorrido del equipo, en un mismo lugar.
              </h2>
              <p className="max-w-sm text-sm leading-6 text-mute">
                Del proveedor al inventario, de la venta al portal del cliente y
                la posventa: cada movimiento conserva responsables, costos,
                comprobantes y referencias.
              </p>
            </div>
            <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {modulos.map(({ tipo, titulo, detalle, Icono, enlace }) => (
                <article
                  key={titulo}
                  id={tipo === "portal" ? "portal" : undefined}
                  className="flex scroll-mt-20 flex-col rounded-2xl border border-fore/[.08] bg-ink p-5 shadow-card transition hover:-translate-y-0.5 hover:border-fono/40"
                >
                  <CapturaModulo tipo={tipo} />
                  <span className="mt-5 grid h-10 w-10 place-items-center rounded-xl bg-fono/10 text-fono-dark">
                    <Icono size={19} />
                  </span>
                  <h3 className="mt-4 font-bold">{titulo}</h3>
                  <p className="mt-2 flex-1 text-sm leading-6 text-mute">{detalle}</p>
                  {enlace && (
                    <a href={enlace} className="toque-44 mt-4 inline-flex items-center gap-1 text-sm font-bold text-fono-dark transition hover:text-fono">
                      Ver cómo funciona <ArrowRight size={15} />
                    </a>
                  )}
                </article>
              ))}
            </div>
          </div>
        </section>
        <section className="mx-auto grid max-w-7xl gap-12 px-5 py-24 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.2em] text-fono-dark">
              El cliente ve lo mismo que vos
            </p>
            <h2 className="mt-4 font-display text-4xl font-bold tracking-[-.04em] sm:text-5xl">
              Cada pedido con su link y su QR.
            </h2>
            <p className="mt-6 leading-7 text-mute">
              El cliente abre el seguimiento desde el comprobante o por
              WhatsApp, sin crear cuenta: estado del pedido, saldo y cuotas,
              garantías y comprobantes. La tienda deja de responder «¿ya está?»
              por teléfono.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href={`${app}/demo`} className="rounded-xl bg-fono px-5 py-3 font-bold text-onbrand shadow-glow transition hover:-translate-y-0.5">
                Ver el portal en el demo
              </a>
              <a href="#impresion" className="rounded-xl border border-fore/15 px-5 py-3 font-semibold transition hover:border-fono-dark/50 hover:text-fono-dark">
                Impresión y offline
              </a>
            </div>
          </div>
          <MockPortal />
        </section>
        <section id="impresion" className="scroll-mt-20 border-y border-fore/[.07] bg-ink-800/60">
          <div className="mx-auto grid max-w-7xl gap-12 px-5 py-24 lg:grid-cols-[1.05fr_.95fr] lg:items-center">
            <div className={GRILLA_DOS_COLUMNAS}>
              <div className="sm:col-span-2"><CapturaModulo tipo="impresion" /></div>
              <CapturaModulo tipo="offline" />
              <CapturaModulo tipo="finanzas" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[.2em] text-fono-dark">
                Impresión y operación sin internet
              </p>
              <h2 className="mt-4 font-display text-4xl font-bold tracking-[-.04em] sm:text-5xl">
                La cola dice la verdad y la venta no se pierde.
              </h2>
              <p className="mt-6 leading-7 text-mute">
                Térmicas de 58 y 80 mm y comprobantes A4, etiquetas de góndola y
                de unidad, cierre de caja y resumen del día. La cola muestra
                pendientes, reintentos y quién los mandó, con cancelación y
                aviso anti-duplicados; la prueba de impresión se confirma con el
                código impreso en el papel.
              </p>
              <ul className="mt-6 space-y-3 text-sm text-mute">
                <li className="flex gap-3"><Printer size={16} className="mt-0.5 shrink-0 text-fono-dark" />Puentes por sucursal con USB directo en el instalador del agente.</li>
                <li className="flex gap-3"><WifiOff size={16} className="mt-0.5 shrink-0 text-fono-dark" />Sin conexión, la venta se guarda en el equipo y se envía al reconectar.</li>
                <li className="flex gap-3"><BarChart3 size={16} className="mt-0.5 shrink-0 text-fono-dark" />Resumen y cierre imprimibles, con exportaciones CSV de cada módulo.</li>
              </ul>
            </div>
          </div>
        </section>
        <section id="accesos" className="mx-auto grid max-w-7xl scroll-mt-20 gap-12 px-5 py-24 lg:grid-cols-2 lg:items-center">
          <div className="rounded-3xl border border-fono/20 bg-ink bg-gradient-to-br from-fono/[.09] to-transparent p-7 sm:p-10">
            <p className="text-xs font-bold uppercase tracking-[.2em] text-fono-dark">
              Acceso que refleja la vida real
            </p>
            <div className="mt-8 space-y-4">
              {accesos.map(([r, d], i) => (
                <div
                  key={r}
                  className="flex gap-4 rounded-2xl border border-fore/10 bg-ink-800/80 p-4"
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-fono text-xs font-bold text-onbrand">
                    {i + 1}
                  </span>
                  <div>
                    <b className="text-sm">{r}</b>
                    <p className="mt-1 text-sm text-mute">{d}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[.2em] text-fono-dark">
              Seguridad sin complicar el día
            </p>
            <h2 className="mt-4 font-display text-4xl font-bold tracking-[-.04em] sm:text-5xl">
              Tu negocio separado. Tu equipo con el acceso justo.
            </h2>
            <p className="mt-6 leading-7 text-mute">
              La tienda inicia sesión una sola vez. Después, cada vendedor abre
              su turno con su PIN de 4 dígitos: el sistema sabe quién vende, qué
              permisos tiene y deja todo auditado.
            </p>
            <div className={cn('mt-8', GRILLA_DOS_COLUMNAS)}>
              <div className="rounded-2xl border border-fore/[.08] bg-ink p-4">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-fono/10 text-fono-dark"><KeyRound size={17} /></span>
                <b className="mt-3 block text-sm">Roles y matriz de permisos</b>
                <p className="mt-1 text-xs text-mute">Qué ve y qué hace cada rol, con autorizaciones para descuentos y entregas con saldo.</p>
              </div>
              <div className="rounded-2xl border border-fore/[.08] bg-ink p-4">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-fono/10 text-fono-dark"><BellRing size={17} /></span>
                <b className="mt-3 block text-sm">Auditoría de todo</b>
                <p className="mt-1 text-xs text-mute">Ventas, cambios de precio, impresión, cobros y movimientos, con la persona real detrás de cada acción.</p>
              </div>
            </div>
            <a
              href={`${app}/login`}
              className="toque-44 mt-8 inline-block font-bold text-fono-dark transition hover:text-fono"
            >
              Configurar mi tienda{" "}
              <ArrowRight className="ml-1 inline" size={17} />
            </a>
          </div>
        </section>
        <section id="precio" className="mx-auto max-w-7xl scroll-mt-20 px-5 pb-24">
          <div className="grid gap-10 overflow-hidden rounded-[2rem] border border-fono/30 bg-blue-line p-8 text-onbrand md:grid-cols-[1fr_auto] md:items-center sm:p-12">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.2em] text-onbrand/85">
                Un plan, operación completa
              </p>
              <h2 className="mt-4 font-display text-4xl font-bold tracking-[-.05em] sm:text-5xl">
                Todo el control que tu tienda necesita.
              </h2>
              <p className="mt-4 max-w-xl leading-7 text-onbrand/90">
                POS con PIN, inventario por IMEI, compras e importaciones, caja y
                conciliación, cliente 360°, servicio técnico, portal del cliente,
                impresión con multi-puente y reportes en un mismo plan.
              </p>
            </div>
            <div className="rounded-2xl bg-ink p-6 text-fore shadow-2xl">
              <span className="text-sm font-bold text-fono-dark">USD</span>
              <strong className="ml-2 text-6xl tracking-[-.08em]">10</strong>
              <span className="ml-2 text-sm text-mute">/ mes</span>
              <a
                href={`${app}/demo`}
                className="mt-5 block rounded-xl bg-fono px-5 py-3 text-center font-bold text-onbrand transition hover:-translate-y-0.5"
              >
                Probar el demo
              </a>
              <a
                href={`${app}/login`}
                className="mt-2 block rounded-xl border border-fore/15 px-5 py-3 text-center font-semibold transition hover:border-fono-dark/50 hover:text-fono-dark"
              >
                Empezar ahora
              </a>
              <p className="mt-3 text-center text-xs text-mute">
                Sin permanencia · soporte incluido
              </p>
            </div>
          </div>
        </section>
        <section className="mx-auto max-w-4xl px-5 pb-24">
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
                  className="flex w-full items-center justify-between gap-4 p-5 text-left"
                >
                  <b className="text-sm sm:text-base">{q}</b>
                  <ChevronDown
                    className={`shrink-0 text-fono-dark transition ${open === i ? "rotate-180" : ""}`}
                    size={19}
                  />
                </button>
                {open === i && (
                  <p
                    id={`faq-respuesta-${i}`}
                    className="px-5 pb-5 text-sm leading-6 text-mute"
                  >
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
            <a
              href={`${app}/demo`}
              className="rounded-xl bg-fono px-5 py-3.5 font-bold text-onbrand shadow-glow transition hover:-translate-y-0.5"
            >
              Probar demo <ArrowRight className="ml-1 inline" size={18} />
            </a>
          </div>
        </section>
      </main>
      <ProductFooter
        className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-5 border-t-0 px-5 py-8 text-xs"
        leading={<span className="flex items-center gap-2">
          <Store size={14} className="text-fono-dark" />
          <b className="text-fore">MobOS</b>
        </span>}
      />
    </div>
  );
}
