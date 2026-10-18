import {
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  Boxes,
  Check,
  CircleDollarSign,
  Clock3,
  Package,
  Printer,
  ShoppingBag,
  UsersRound,
} from 'lucide-react'

const modules = ['Punto de venta', 'Caja y finanzas', 'Inventario', 'Clientes']

function PreviewFrame({ id, title, label, icon: Icon, children, wide = false }) {
  return (
    <article className={`landing-showcase-card${wide ? ' landing-showcase-card--wide' : ''}`} data-testid={`showcase-${id}`}>
      <div className="landing-showcase-title">
        <span className="landing-showcase-icon" aria-hidden="true"><Icon size={18} /></span>
        <h3>{title}</h3>
        <span className="landing-showcase-sample">MUESTRA</span>
      </div>
      <div className="landing-showcase-visual">{children}</div>
      <p className="landing-showcase-caption">{label} · Datos ficticios</p>
    </article>
  )
}

function SalePreview() {
  return <div className="showcase-pos">
    <div className="showcase-toolbar"><span>Venta nueva</span><span className="showcase-pill">Sucursal Centro</span></div>
    <div className="showcase-pos-line"><span className="showcase-product-dot" /><span>iPhone 15 · 128 GB</span><b>Gs 5.200.000</b></div>
    <div className="showcase-pos-line"><span className="showcase-product-dot showcase-product-dot--mint" /><span>Funda transparente</span><b>Gs 80.000</b></div>
    <div className="showcase-pos-total"><span>2 productos</span><strong>Gs 5.280.000</strong></div>
    <div className="showcase-action">Continuar venta <ArrowUpRight size={14} /></div>
  </div>
}

function CashPreview() {
  return <div className="showcase-cash">
    <div className="showcase-cash-total"><small>Saldo esperado</small><strong>Gs 2.450.000</strong><span>Turno abierto · 09:00</span></div>
    <div className="showcase-cash-row"><span><ArrowDownLeft size={14} /> Apertura</span><b>Gs 500.000</b></div>
    <div className="showcase-cash-row"><span><ArrowUpRight size={14} /> Ventas</span><b>Gs 2.120.000</b></div>
    <div className="showcase-cash-row"><span><ArrowDownLeft size={14} /> Retiro</span><b>Gs 170.000</b></div>
  </div>
}

function StockPreview() {
  return <div className="showcase-stock">
    <div className="showcase-toolbar"><span>Stock por sucursal</span><span className="showcase-pill">3 locales</span></div>
    {[['Centro', '12'], ['Shopping', '4'], ['San Lorenzo', '7']].map(([name, count]) => <div className="showcase-stock-row" key={name}><span><i />{name}</span><b>{count} unidades</b></div>)}
    <div className="showcase-progress"><span style={{ width: '68%' }} /></div>
    <small>Conteo actualizado · hace 12 min</small>
  </div>
}

function ModulesPreview() {
  return <div className="showcase-modules">{modules.map((name, index) => <div className="showcase-module" key={name}><span className={`showcase-module-icon tone-${index}`}><Boxes size={15} /></span><span>{name}</span><Check size={14} /></div>)}<small>Elegí las herramientas que usa tu equipo</small></div>
}

function PrintPreview() {
  return <div className="showcase-print">
    <div className="showcase-print-paper"><strong>MOBOS · COMPROBANTE</strong><span>Pedido EJ-001</span><span>iPhone 15 · 128 GB</span><span>Funda transparente</span><i /><b>TOTAL <strong>Gs 5.280.000</strong></b><small>Lucía Ejemplo · 18/10/2026</small></div>
    <div className="showcase-print-meta"><Printer size={17} /><span>Comprobante<br /><b>Vista de impresión</b></span></div>
  </div>
}

function ClientPreview() {
  return <div className="showcase-client">
    <div className="showcase-client-head"><span className="showcase-avatar">LE</span><span><b>Hola, Lucía</b><small>Tu espacio de cliente</small></span><ShoppingBag size={16} /></div>
    <div className="showcase-order"><div><span>Pedido EJ-001</span><b>En preparación</b></div><div className="showcase-order-track"><i /><i /><i /><i /></div><small><Check size={12} /> Venta confirmada <span>Preparando tu pedido</span></small></div>
    <div className="showcase-client-link">Ver pedido y comprobante <ArrowUpRight size={13} /></div>
  </div>
}

function AnalyticsPreview() {
  const bars = [35, 51, 43, 69, 57, 82, 64, 94, 72, 86, 66, 100]
  return <div className="showcase-analytics">
    <div className="showcase-kpi"><span>Ventas registradas</span><b>Gs 18,4 M</b><small><ArrowUpRight size={12} /> 12% vs. período anterior</small></div>
    <div className="showcase-chart" aria-label="Gráfico ilustrativo de ventas"><div className="showcase-bars">{bars.map((height, i) => <i key={i} style={{ height: `${height}%` }} />)}</div></div>
    <div className="showcase-chart-label"><span>01 oct</span><span>18 oct</span><span>31 oct</span></div>
  </div>
}

export default function ShowcaseMobOS() {
  return <section className="landing-showcase landing-container" aria-labelledby="landing-showcase-title" data-testid="landing-showcase">
    <header className="landing-showcase-heading"><p className="landing-eyebrow">ASÍ SE VE EL TRABAJO DIARIO</p><h2 id="landing-showcase-title">Una vista clara de cada parte del negocio.</h2><p>Recorré ejemplos ilustrativos de las herramientas de MobOS. La información en pantalla es ficticia.</p></header>
    <div className="landing-showcase-grid">
      <PreviewFrame id="pos" title="Punto de venta" label="Catálogo y carrito" icon={ShoppingBag}><SalePreview /></PreviewFrame>
      <PreviewFrame id="caja" title="Caja" label="Apertura, movimientos y saldo" icon={CircleDollarSign}><CashPreview /></PreviewFrame>
      <PreviewFrame id="stock" title="Stock por sucursal" label="Disponibilidad y conteo" icon={Package}><StockPreview /></PreviewFrame>
      <PreviewFrame id="modulos" title="Módulos" label="Herramientas para tu operación" icon={Boxes}><ModulesPreview /></PreviewFrame>
      <PreviewFrame id="impresion" title="Impresión" label="Comprobante ilustrativo" icon={Printer}><PrintPreview /></PreviewFrame>
      <PreviewFrame id="clientes" title="Clientes y portal" label="Pedido y seguimiento" icon={UsersRound}><ClientPreview /></PreviewFrame>
      <PreviewFrame id="analytics" title="Analytics" label="Métricas de muestra" icon={BarChart3} wide><AnalyticsPreview /></PreviewFrame>
    </div>
    <p className="landing-showcase-disclaimer"><Clock3 size={14} /> Los ejemplos son ilustraciones de interfaz y no representan actividad de una tienda real.</p>
  </section>
}
