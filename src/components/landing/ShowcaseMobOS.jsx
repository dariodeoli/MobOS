import {
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  Bell,
  Boxes,
  Check,
  CircleDollarSign,
  Clock3,
  Building2,
  FileCheck2,
  FileClock,
  KeyRound,
  MessageSquareText,
  Package,
  PackageCheck,
  Printer,
  Route,
  ScanLine,
  ShieldCheck,
  ShoppingBag,
  Truck,
  UsersRound,
  Wrench,
} from 'lucide-react'

const modules = ['Punto de venta', 'Caja y finanzas', 'Inventario', 'Clientes', 'Taller', 'Delivery']

function PreviewFrame({ id, title, label, icon: Icon, children, wide = false, tone = 'green', status = 'MUESTRA' }) {
  return (
    <article className={`landing-showcase-card${wide ? ' landing-showcase-card--wide' : ''}`} data-testid={`showcase-${id}`} data-tone={tone}>
      <div className="landing-showcase-title">
        <span className="landing-showcase-icon" aria-hidden="true"><Icon size={18} /></span>
        <h3>{title}</h3>
        <span className={`landing-showcase-sample${status === 'EN PREPARACIÓN' ? ' landing-showcase-sample--future' : ''}`}>{status}</span>
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
    <div className="showcase-client-head"><span className="showcase-avatar">LE</span><span><b>Lucía Ejemplo</b><small>Cliente desde octubre 2025</small></span><UsersRound size={16} /></div>
    <div className="showcase-client-stats"><div><small>Compras</small><b>8</b></div><div><small>Saldo</small><b>Gs 450.000</b></div></div>
    <div className="showcase-client-activity"><span><Check size={12} /> Última venta · EJ-001</span><b>18 oct 2026</b></div>
    <div className="showcase-client-link">Ver ficha y actividad <ArrowUpRight size={13} /></div>
  </div>
}

function PortalPreview() {
  return <div className="showcase-portal">
    <div className="showcase-portal-heading"><span className="showcase-avatar">LE</span><span><b>Portal de Lucía</b><small>Pedido de ejemplo · EJ-001</small></span></div>
    <div className="showcase-portal-status"><Check size={15} /><span><b>En preparación</b><small>Actualizado hoy · dato de muestra</small></span></div>
    <div className="showcase-portal-row"><span>Saldo pendiente</span><b>Gs 450.000</b></div>
    <div className="showcase-portal-link"><FileCheck2 size={14} /> Ver comprobante y seguimiento</div>
  </div>
}

function WorkshopPreview() {
  return <div className="showcase-workshop">
    <div className="showcase-toolbar"><span>Orden de servicio</span><span className="showcase-pill">ST-024</span></div>
    <div className="showcase-workshop-device"><span className="showcase-workshop-phone"><ScanLine size={17} /></span><span><b>iPhone 13 · ejemplo</b><small>Equipo en diagnóstico</small></span></div>
    <div className="showcase-workshop-steps"><span className="is-done"><Check size={12} />Ingreso</span><span className="is-current"><Wrench size={12} />Diagnóstico</span><span><PackageCheck size={12} />Entrega</span></div>
    <small className="showcase-workshop-note"><FileClock size={12} /> Historial y responsable visibles</small>
  </div>
}

function DeliveryPreview() {
  return <div className="showcase-delivery">
    <div className="showcase-toolbar"><span>Entregas del día</span><span className="showcase-pill">2 asignadas</span></div>
    <div className="showcase-delivery-order"><span className="showcase-delivery-icon"><Truck size={16} /></span><span><b>Pedido EJ-001</b><small>Lucía Ejemplo · Centro</small></span><span className="showcase-delivery-state">En camino</span></div>
    <div className="showcase-route"><span /><i /><span /><i /><span /></div>
    <div className="showcase-delivery-footer"><Route size={13} /> Recorrido ilustrativo · sin mapa externo</div>
  </div>
}

function MessagesPreview() {
  return <div className="showcase-messages">
    <div className="showcase-toolbar"><span>Aviso al cliente</span><span className="showcase-pill">Borrador</span></div>
    <div className="showcase-message-bubble"><span>Hola, Lucía. Tu pedido de ejemplo está listo para retirar en la sucursal Centro.</span><small>Mensaje de muestra · no enviado</small></div>
    <div className="showcase-message-actions"><MessageSquareText size={14} /> Plantilla editable <Bell size={14} /> Aviso manual</div>
  </div>
}

function ImeiPreview() {
  return <div className="showcase-imei">
    <div className="showcase-imei-device"><span><ScanLine size={16} /></span><span><b>iPhone 15 · ejemplo</b><small>IMEI •••••••••••3809</small></span><ShieldCheck size={17} /></div>
    <div className="showcase-imei-checks"><span><Check size={13} />Sin reportes · simulado</span><span><Check size={13} />Find My/iCloud desactivado</span><span><Check size={13} />SIM lock libre</span></div>
    <small>Resultado ficticio · no consulta proveedores</small>
  </div>
}

function PermissionsPreview() {
  return <div className="showcase-permissions">
    <div className="showcase-toolbar"><span>Accesos por rol</span><span className="showcase-pill">3 perfiles</span></div>
    {[['Dueño', 'Todo el negocio', true], ['Caja', 'Cobros y turnos', true], ['Técnico', 'Órdenes de servicio', false]].map(([rol, detalle, activo]) => <div className="showcase-permission-row" key={rol}><span className="showcase-permission-icon"><KeyRound size={13} /></span><span><b>{rol}</b><small>{detalle}</small></span><i className={activo ? 'is-on' : ''} aria-label={activo ? 'Acceso habilitado' : 'Acceso limitado'} /></div>)}
    <small>Permisos configurables · datos de muestra</small>
  </div>
}

function BillingPreview() {
  return <div className="showcase-billing">
    <span className="showcase-billing-icon"><Building2 size={19} /></span>
    <div><b>Facturación electrónica</b><small>El módulo todavía no está disponible.</small></div>
    <span className="showcase-billing-badge">En preparación</span>
    <p>La disponibilidad y las conexiones se anunciarán cuando estén listas.</p>
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
      <PreviewFrame id="pos" title="Punto de venta" label="Catálogo y carrito" icon={ShoppingBag} tone="green"><SalePreview /></PreviewFrame>
      <PreviewFrame id="caja" title="Caja" label="Apertura, movimientos y saldo" icon={CircleDollarSign} tone="amber"><CashPreview /></PreviewFrame>
      <PreviewFrame id="stock" title="Stock por sucursal" label="Disponibilidad y conteo" icon={Package} tone="blue"><StockPreview /></PreviewFrame>
      <PreviewFrame id="taller" title="Taller" label="Órdenes y diagnóstico" icon={Wrench} tone="violet"><WorkshopPreview /></PreviewFrame>
      <PreviewFrame id="clientes" title="Clientes" label="Ficha y actividad" icon={UsersRound} tone="rose"><ClientPreview /></PreviewFrame>
      <PreviewFrame id="portal" title="Portal del cliente" label="Seguimiento y documentos" icon={FileCheck2} tone="green"><PortalPreview /></PreviewFrame>
      <PreviewFrame id="impresion" title="Impresión" label="Comprobante ilustrativo" icon={Printer} tone="slate"><PrintPreview /></PreviewFrame>
      <PreviewFrame id="modulos" title="Módulos" label="Herramientas para tu operación" icon={Boxes} tone="blue"><ModulesPreview /></PreviewFrame>
      <PreviewFrame id="analytics" title="Analytics" label="Métricas de muestra" icon={BarChart3} tone="violet"><AnalyticsPreview /></PreviewFrame>
      <PreviewFrame id="delivery" title="Delivery" label="Asignación y seguimiento" icon={Truck} tone="amber"><DeliveryPreview /></PreviewFrame>
      <PreviewFrame id="mensajes" title="Mensajes" label="Plantillas y avisos" icon={MessageSquareText} tone="rose"><MessagesPreview /></PreviewFrame>
      <PreviewFrame id="imei" title="Verificación IMEI" label="Estados de ejemplo" icon={ScanLine} tone="green"><ImeiPreview /></PreviewFrame>
      <PreviewFrame id="permisos" title="Permisos" label="Accesos según el rol" icon={KeyRound} tone="slate"><PermissionsPreview /></PreviewFrame>
      <PreviewFrame id="facturacion" title="Facturación futura" label="Módulo en preparación" icon={Building2} tone="amber" status="EN PREPARACIÓN"><BillingPreview /></PreviewFrame>
    </div>
    <p className="landing-showcase-disclaimer"><Clock3 size={14} /> Los ejemplos son ilustraciones de interfaz y no representan actividad de una tienda real.</p>
  </section>
}
