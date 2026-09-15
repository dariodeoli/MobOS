import {
  ArrowRight,
  BarChart3,
  Building2,
  Check,
  ChevronDown,
  CircleDollarSign,
  CreditCard,
  Fingerprint,
  MessageCircle,
  Package,
  QrCode,
  ReceiptText,
  ScanLine,
  ShieldCheck,
  Smartphone,
  Store,
  Truck,
  Wrench,
} from "lucide-react";
import { useState } from "react";
import { publicUrls } from "@/lib/urls";
import ProductFooter from '@/components/app/ProductFooter'
import ThemeLogo from '@/components/app/ThemeLogo'
import ThemeToggle from '@/components/app/ThemeToggle'

const modules = [
  [
    "POS que no frena la venta",
    "Buscá, agregá, cobrá y dejá cada movimiento vinculado al vendedor que ingresó con su PIN.",
    ReceiptText,
  ],
  [
    "Stock por unidad y ubicación",
    "IMEI, serial, batería, condición, sucursal y depósito con reservas, transferencias y verificación física.",
    ScanLine,
  ],
  [
    "Caja y pagos reales",
    "Efectivo, transferencia, POS, USDT, pagos parciales y cuentas configurables en una venta.",
    CreditCard,
  ],
  [
    "Compras e importaciones",
    "Proveedores, crédito, anticipos, flete, seguro, impuestos y costo final distribuido por equipo o lote.",
    Truck,
  ],
  [
    "Clientes conectados",
    "RUC o CI, varias direcciones, historial, pedidos, plantillas de WhatsApp y seguimiento público.",
    MessageCircle,
  ],
  [
    "Trade-in y servicio técnico",
    "Recepción, diagnóstico, técnico, costos, garantía y reingreso del equipo al stock con trazabilidad.",
    Wrench,
  ],
  [
    "Etiquetas y comprobantes",
    "Impresión térmica o A4, IMEI visible, últimos cuatro dígitos, código de barras y QR.",
    QrCode,
  ],
  [
    "Sucursales sin confusión",
    "Disponibilidad, tránsito y depósitos separados, con movimientos auditables entre locales.",
    Building2,
  ],
  [
    "Control para dueños",
    "Ventas, margen real, caja, rendimiento, permisos y auditoría para decidir con datos.",
    BarChart3,
  ],
];
const faqs = [
  [
    "¿Puedo probar antes de crear una cuenta?",
    "Sí. La demo es una tienda de ejemplo: usá el PIN 2001 como vendedor o 3001 como dueño.",
  ],
  [
    "¿Cada vendedor tiene su propio acceso?",
    "Sí. La empresa inicia sesión y cada persona abre su turno con PIN. Las ventas quedan vinculadas automáticamente.",
  ],
  [
    "¿Sirve para más de una sucursal?",
    "Sí. MobOS separa empresa, sucursal y ubicación física, con movimientos auditables entre locales.",
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
        <i className="h-2 w-2 rounded-full bg-red-400" />
        <i className="h-2 w-2 rounded-full bg-amber-300" />
        <i className="h-2 w-2 rounded-full bg-fono" />
        <span className="ml-3 rounded bg-fore/5 px-2 py-1">
          {appDomain.replace("https://", "")}
        </span>
      </div>
      <div className="grid min-h-[355px] grid-cols-[76px_1fr] overflow-hidden rounded-b-[1.35rem] bg-paper sm:grid-cols-[118px_1fr]">
        <aside className="border-r border-fore/5 bg-ink-800 px-2 py-4 sm:px-3">
          <b className="mb-7 hidden text-xs text-fono-dark sm:block">MOBOS</b>
          {["Resumen", "Ventas", "Productos", "Stock", "Clientes"].map(
            (x, i) => (
              <div
                key={x}
                className={`mb-1 rounded-lg px-2 py-2 text-[10px] sm:text-xs ${i === 0 ? "bg-fono/12 text-fono-dark" : "text-mute"}`}
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
            <b className="h-fit rounded-lg bg-fono/10 px-2 py-1 text-[10px] text-fono-dark">
              ASU · EN VIVO
            </b>
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
          <div className="mt-4 flex gap-3 rounded-xl bg-fono/10 p-3">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-fono text-onbrand">
              <Package size={14} />
            </span>
            <p className="text-[10px] text-fore/80">
              <b className="text-fore">4 productos</b> necesitan reposición
              esta semana.
            </p>
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
export default function Landing() {
  const [open, setOpen] = useState(0);
  const { app } = publicUrls;
  return (
    <div className="min-h-dvh overflow-hidden bg-paper text-fore selection:bg-fono selection:text-onbrand">
      <header className="sticky top-0 z-30 border-b border-fore/[.07] bg-paper/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3.5">
          <a href="#inicio">
            <ThemeLogo className="h-9" />
          </a>
          <nav className="hidden gap-6 text-sm text-mute md:flex">
            <a href="#operacion" className="transition hover:text-fore">Operación</a>
            <a href="#modulos" className="transition hover:text-fore">Módulos</a>
            <a href="#accesos" className="transition hover:text-fore">Accesos</a>
            <a href="#precio" className="transition hover:text-fore">Precio</a>
          </nav>
          <div className="flex items-center gap-2">
            <a href="/status" className="text-sm font-semibold text-mute transition hover:text-fono-dark">Estado del sistema</a>
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main>
        <section id="inicio" className="relative isolate overflow-hidden">
          <i className="absolute left-[6%] top-8 -z-10 h-80 w-80 rounded-full bg-fono/10 blur-[110px]" />
          <i className="absolute right-[-8%] top-40 -z-10 h-96 w-96 rounded-full bg-fono-glow/20 blur-[120px]" />
          <div className="mx-auto grid max-w-7xl gap-14 px-5 pb-20 pt-16 lg:grid-cols-[.9fr_1.1fr] lg:items-center lg:py-24">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-fono/25 bg-fono/[.08] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[.16em] text-fono-dark">
                <span className="h-1.5 w-1.5 rounded-full bg-fono" />
                Operación completa para tiendas móviles
              </p>
              <h1 className="mt-6 font-display text-5xl font-bold leading-[.91] tracking-[-.065em] sm:text-6xl lg:text-7xl">
                Vendé con ritmo.
                <br />
                <span className="text-fono-dark">Controlá con certeza.</span>
              </h1>
              <p className="mt-7 max-w-xl text-lg leading-8 text-mute">
                MobOS conecta POS, inventario por IMEI, caja, compras,
                clientes, trade-in y servicio técnico. Una sola operación,
                desde que entra un equipo hasta que termina la posventa.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <a
                  href={`${app}/login`}
                  className="rounded-xl bg-fono px-5 py-3.5 font-bold text-onbrand shadow-glow transition hover:-translate-y-0.5"
                >
                  Crear mi tienda{" "}
                  <ArrowRight className="ml-1 inline" size={18} />
                </a>
                <a
                  href={`${app}/demo`}
                  className="rounded-xl border border-fore/15 px-5 py-3.5 font-semibold transition hover:border-fono-dark/50 hover:text-fono-dark"
                >
                  Ver demo interactiva
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
          <div className="mx-auto grid max-w-7xl gap-6 px-5 py-7 sm:grid-cols-3">
            <p className="text-sm text-mute">
              <b className="block font-display text-lg text-fore">Una venta, un flujo.</b>
                Cliente, cobro, stock, caja, entrega y garantía conectados.
            </p>
            <p className="text-sm text-mute">
              <b className="block font-display text-lg text-fore">PYG, USD y más.</b> Ventas,
              compras y saldos conservan moneda y cotización.
            </p>
            <p className="text-sm text-mute">
              <b className="block font-display text-lg text-fore">Diseñado para móvil.</b> El
              vendedor opera desde teléfono o computadora.
            </p>
          </div>
        </section>
        <section id="operacion" className="mx-auto max-w-7xl px-5 py-24">
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
                vende. Busca al cliente, encuentra el producto y cobra como
                corresponda.
              </p>
            </div>
            <div className="grid gap-3">
              {[
                [
                  "01",
                  "Abrí el POS con PIN",
                  "Cada venta, descuento y comisión queda a nombre de quien la hizo.",
                  Fingerprint,
                ],
                [
                  "02",
                  "Encontrá lo que necesitás",
                  "Clientes, productos, variantes, IMEI y compatibilidades sin planillas.",
                  Smartphone,
                ],
                [
                  "03",
                  "Cobrá sin forzar el pago",
                  "Total, pendiente, reserva o pagos divididos entre varias cuentas.",
                  CircleDollarSign,
                ],
                [
                  "04",
                  "Seguimiento listo",
                  "Stock, cliente, garantía y caja se actualizan desde la misma orden.",
                  ShieldCheck,
                ],
              ].map(([n, t, d, I]) => (
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
          className="border-y border-fore/[.07] bg-ink-800/60"
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
                Del proveedor al inventario, de la venta a la garantía: cada
                movimiento conserva responsables, costos y referencias.
              </p>
            </div>
            <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {modules.map(([t, d, I]) => (
                <article
                  key={t}
                  className="rounded-2xl border border-fore/[.08] bg-ink p-6 shadow-card transition hover:-translate-y-0.5 hover:border-fono/40"
                >
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-fono/10 text-fono-dark">
                    <I size={21} />
                  </span>
                  <h3 className="mt-6 font-bold">{t}</h3>
                  <p className="mt-2 text-sm leading-6 text-mute">{d}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
        <section
          id="accesos"
          className="mx-auto grid max-w-7xl gap-12 px-5 py-24 lg:grid-cols-2 lg:items-center"
        >
          <div className="rounded-3xl border border-fono/20 bg-ink bg-gradient-to-br from-fono/[.09] to-transparent p-7 sm:p-10">
            <p className="text-xs font-bold uppercase tracking-[.2em] text-fono-dark">
              Acceso que refleja la vida real
            </p>
            <div className="mt-8 space-y-4">
              {[
                [
                  "Dueño y administración",
                  "Resumen, caja, costos, reportes, permisos y configuración.",
                ],
                [
                  "Vendedor",
                  "POS, clientes, productos, pedidos, promociones y trade-in.",
                ],
                [
                  "PIN individual",
                  "Cada venta se atribuye automáticamente a quien atendió.",
                ],
              ].map(([r, d], i) => (
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
              Creá una tienda con correo y contraseña o ingresá con Google.
              Después cada colaborador usa su código para trabajar en su rol.
            </p>
            <a
              href={`${app}/login`}
              className="mt-8 inline-block font-bold text-fono-dark transition hover:text-fono"
            >
              Configurar mi tienda{" "}
              <ArrowRight className="ml-1 inline" size={17} />
            </a>
          </div>
        </section>
        <section id="precio" className="mx-auto max-w-7xl px-5 pb-24">
          <div className="grid gap-10 overflow-hidden rounded-[2rem] border border-fono/30 bg-blue-line p-8 text-onbrand md:grid-cols-[1fr_auto] md:items-center sm:p-12">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.2em] text-onbrand/85">
                Un plan, operación completa
              </p>
              <h2 className="mt-4 font-display text-4xl font-bold tracking-[-.05em] sm:text-5xl">
                Todo el control que tu tienda necesita.
              </h2>
              <p className="mt-4 max-w-xl leading-7 text-onbrand/90">
                POS, usuarios, sucursales, inventario, compras, pagos, caja,
                clientes, trade-in, garantías y reportes en un mismo plan.
              </p>
            </div>
            <div className="rounded-2xl bg-ink p-6 text-fore shadow-2xl">
              <span className="text-sm font-bold text-fono-dark">USD</span>
              <strong className="ml-2 text-6xl tracking-[-.08em]">10</strong>
              <span className="ml-2 text-sm text-mute">/ mes</span>
              <a
                href={`${app}/login`}
                className="mt-5 block rounded-xl bg-fono px-5 py-3 text-center font-bold text-onbrand transition hover:-translate-y-0.5"
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
        <section className="border-t border-fore/[.07] bg-ink-800/60">
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
                <b className="font-mono text-fono-dark">3001</b> dueño
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
