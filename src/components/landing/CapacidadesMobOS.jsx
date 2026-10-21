import {
  BarChart3,
  ClipboardList,
  FileText,
  Headset,
  PackageSearch,
  Printer,
  ShieldCheck,
  UsersRound,
} from 'lucide-react'

const capacidades = [
  {
    titulo: 'Ventas y pedidos',
    detalle: 'Registrá ventas en el POS, consultá cada pedido y seguí sus pagos y preparación.',
    Icono: ClipboardList,
  },
  {
    titulo: 'Clientes y portal',
    detalle: 'Mantené el historial del cliente y compartí el acceso a pedidos, comprobantes y garantías.',
    Icono: UsersRound,
  },
  {
    titulo: 'Stock por sucursal',
    detalle: 'Controlá equipos por IMEI, accesorios por cantidad y movimientos entre sucursales.',
    Icono: PackageSearch,
  },
  {
    titulo: 'Servicio y garantía',
    detalle: 'Dale seguimiento a trabajos técnicos, reparaciones y garantías desde la operación.',
    Icono: Headset,
  },
  {
    titulo: 'Finanzas y comisiones',
    detalle: 'Revisá caja, ventas, resultados y comisiones con información registrada en MobOS.',
    Icono: BarChart3,
  },
  {
    titulo: 'Tickets y etiquetas',
    detalle: 'Configurá formatos de impresión para comprobantes, documentos y etiquetas.',
    Icono: Printer,
  },
  {
    titulo: 'Equipo y permisos',
    detalle: 'Asigná roles al personal y consultá la actividad de las operaciones.',
    Icono: ShieldCheck,
  },
  {
    titulo: 'Políticas y documentos',
    detalle: 'Publicá información y condiciones de tu tienda para que el cliente las consulte.',
    Icono: FileText,
  },
]

export default function CapacidadesMobOS() {
  return (
    <section id="capacidades" className="landing-capabilities landing-container" aria-labelledby="capacidades-titulo">
      <div className="landing-capabilities-heading" data-reveal>
        <p className="landing-eyebrow">UNA OPERACIÓN CONECTADA</p>
        <h2 id="capacidades-titulo">Todo el trabajo de tu tienda, en un solo lugar.</h2>
        <p>
          MobOS reúne las herramientas de venta y gestión que ya forman parte de la plataforma.
          Cada empresa administra sus datos, equipo y sucursales.
        </p>
      </div>

      <div className="landing-capability-grid" data-testid="landing-capacidades-disponibles">
        {capacidades.map(({ titulo, detalle, Icono }) => (
          <article className="landing-capability" key={titulo} data-reveal>
            <span className="landing-capability-icon" aria-hidden="true"><Icono size={20} /></span>
            <div>
              <h3>{titulo}</h3>
              <p>{detalle}</p>
            </div>
          </article>
        ))}
      </div>

      <aside data-reveal className="landing-integrations" aria-labelledby="integraciones-titulo">
        <p className="landing-eyebrow">EN PREPARACIÓN</p>
        <h3 id="integraciones-titulo">Nuevas conexiones para ampliar MobOS</h3>
        <p>
          La emisión de facturas mediante proveedores externos, las consultas fiscales por CI,
          la fidelización con puntos y el intercambio de stock entre empresas requieren integrar
          y validar cada servicio antes de ofrecerlo.
        </p>
      </aside>
    </section>
  )
}
