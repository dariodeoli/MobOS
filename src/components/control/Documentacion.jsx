import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, Card, EmptyState, Input } from '@/components/ui'
import Icon from '@/components/shared/Icon'

// Documentación interna: dónde se configura cada cosa y cómo funciona. Cada
// resultado lleva la ubicación exacta, una explicación breve y un enlace
// directo a la pantalla. El buscador ignora mayúsculas y acentos.
const AYUDA = [
  {
    modulo: 'POS', titulo: 'Cargar una venta', ubicacion: 'POS → /ventas',
    explicacion: 'Elegí el cliente, buscá productos por nombre, modelo o IMEI, ajustá cantidades y cobrá. El vendedor se asigna solo según quién está operando.',
    ruta: '/ventas',
  },
  {
    modulo: 'POS', titulo: 'Pagos divididos', ubicacion: 'POS → /ventas · bloque de cobros',
    explicacion: 'Agregá un pago por cada medio o cuenta, dividí el importe y mirá el saldo restante. Con pago completo el botón es Confirmar venta; con saldo, Crear pedido.',
    ruta: '/ventas',
  },
  {
    modulo: 'POS', titulo: 'Bloqueo de pantalla y PIN', ubicacion: 'Barra superior → menú de tres puntos',
    explicacion: 'La pantalla se bloquea sola por inactividad (10 minutos por defecto) o con Bloquear pantalla. Se desbloquea con el PIN personal, que valida solo al completarlo.',
    ruta: '/ventas',
  },
  {
    modulo: 'POS', titulo: 'Preferencias y notificaciones', ubicacion: 'Barra superior → menú de tres puntos → Preferencias',
    explicacion: 'Cambiá el tema claro/oscuro, los minutos de bloqueo y si querés ver el aviso de novedades. El panel de notificaciones junta pedidos, aprobaciones, comentarios y menciones.',
    ruta: '/ventas',
  },
  {
    modulo: 'Pedidos', titulo: 'Buscar y abrir un pedido', ubicacion: 'Pedidos → /pedidos',
    explicacion: 'La lista es una tabla con fecha, cliente, monto y estado. Hacé clic en la fila para abrir el detalle; el código MOB-#0001 es solo para leerlo, el pedido se abre por su identificador interno.',
    ruta: '/pedidos',
  },
  {
    modulo: 'Pedidos', titulo: 'Entrega y retiro', ubicacion: 'Pedido → Entrega · Delivery → /delivery',
    explicacion: 'La entrega se marca aparte del pago: retiro (listo/retirado) o delivery (preparando/enviado/entregado). Los repartidores ven sus pedidos asignados en su propio panel.',
    ruta: '/delivery',
  },
  {
    modulo: 'Pedidos', titulo: 'Comentarios internos y menciones', ubicacion: 'Pedido → Cronología',
    explicacion: 'Los comentarios son del equipo, nunca los ve el cliente. Escribí @nombre para avisarle a alguien: le llega al panel de notificaciones.',
    ruta: '/pedidos',
  },
  {
    modulo: 'Clientes', titulo: 'Ficha del cliente', ubicacion: 'Clientes → /clientes',
    explicacion: 'La tabla busca por cualquier dato. En la ficha están el resumen, los pedidos, la cronología, las estadísticas y los datos comerciales (crédito, mayorista, facturación).',
    ruta: '/clientes',
  },
  {
    modulo: 'Clientes', titulo: 'Seguro del equipo', ubicacion: 'Productos → ficha del producto → Seguro',
    explicacion: 'El porcentaje de seguro se carga en la ficha del producto y suma al costo real para calcular el margen. En el POS se ve reflejado en la ganancia.',
    ruta: '/productos',
  },
  {
    modulo: 'Equipo', titulo: 'Staff, roles y PIN', ubicacion: 'Configuración → Equipo → /configuracion/equipo',
    explicacion: 'Cada integrante tiene nombre, correo, rol y sucursal. Desde la fila podés cambiar el rol y asignar un PIN nuevo de 4 a 6 dígitos (aleatorio o manual): el PIN nunca se muestra.',
    ruta: '/configuracion/equipo',
  },
  {
    modulo: 'Equipo', titulo: 'Roles y permisos', ubicacion: 'Configuración → Roles y permisos',
    explicacion: 'El rol define el máximo de permisos; por integrante se pueden recortar acciones. El servidor aplica el recorte en cada endpoint.',
    ruta: '/configuracion/roles',
  },
  {
    modulo: 'Inventario', titulo: 'Unidades, stock y reservas', ubicacion: 'Inventario → /inventario/unidades',
    explicacion: 'Cada equipo se sigue por IMEI/serial: ubicación, reservas, tránsito, verificaciones y cronología con fotos. Las alertas avisan cuando el stock baja del punto de reorden.',
    ruta: '/inventario/unidades',
  },
  {
    modulo: 'Inventario', titulo: 'Kardex de un producto', ubicacion: 'Productos → ficha del producto → Kardex',
    explicacion: 'Muestra el saldo corrido de entradas y salidas con el motivo de cada movimiento, y se puede exportar a CSV.',
    ruta: '/productos',
  },
  {
    modulo: 'Inventario', titulo: 'Importar productos', ubicacion: 'Compras / Productos → Importar',
    explicacion: 'Cargá un CSV o Excel, revisá la vista previa fila por fila y confirmá. Si algo salió mal, la importación se puede deshacer.',
    ruta: '/productos',
  },
  {
    modulo: 'Finanzas', titulo: 'Caja del día', ubicacion: 'Finanzas → Caja → /finanzas/caja',
    explicacion: 'Abrí y cerrá la caja con arqueo por denominación; cada movimiento queda con quién, cuándo y de qué pedido. Los turnos son por usuario.',
    ruta: '/finanzas/caja',
  },
  {
    modulo: 'Finanzas', titulo: 'Cuentas de cobro y bancos', ubicacion: 'Finanzas → Bancos y cuentas → /finanzas/bancos',
    explicacion: 'Cargá las cuentas con su banco, titular, moneda y logo; marcá la predeterminada. En el POS se eligen al cobrar y aceptan descuento.',
    ruta: '/finanzas/bancos',
  },
  {
    modulo: 'Finanzas', titulo: 'Créditos y cuotas', ubicacion: 'Finanzas → Créditos / Cuotas',
    explicacion: 'Seguimiento de la deuda por cliente y pedido, con recordatorios de cuotas vencidas por WhatsApp y registro de cada cobro.',
    ruta: '/finanzas/creditos',
  },
  {
    modulo: 'Impresión', titulo: 'Impresoras y puentes', ubicacion: 'Configuración → Impresoras → /configuracion/impresoras',
    explicacion: 'Vinculá el puente de la sucursal, elegí la impresora predeterminada y probá la impresión. Los comprobantes salen por el puente de cada sucursal.',
    ruta: '/configuracion/impresoras',
  },
  {
    modulo: 'Impresión', titulo: 'Documentos y comprobantes', ubicacion: 'Pedido → Recibo / Nota de entrega',
    explicacion: 'Cada pedido puede imprimir comprobantes en A4 o 58 mm y documentos no fiscales (nota de entrega, remisión, recibo, proforma).',
    ruta: '/pedidos',
  },
  {
    modulo: 'Configuración', titulo: 'Perfil de la empresa', ubicacion: 'Configuración → Negocio → /configuracion/negocio',
    explicacion: 'Nombre, logo, dirección, RUC y datos que salen en los comprobantes y en el portal del cliente.',
    ruta: '/configuracion/negocio',
  },
  {
    modulo: 'Configuración', titulo: 'Sucursales', ubicacion: 'Configuración → Sucursales',
    explicacion: 'Cargá cada tienda con su dirección y datos. El selector de la barra superior cambia la sucursal activa y todo el panel respeta ese alcance.',
    ruta: '/configuracion/sucursales',
  },
  {
    modulo: 'Configuración', titulo: 'Listas de precios', ubicacion: 'Configuración → Listas de precios',
    explicacion: 'Definí precios por producto o categoría, con escalones por cantidad. Al vender, el cliente con lista asignada ve su precio y el origen queda visible.',
    ruta: '/configuracion/precios',
  },
  {
    modulo: 'Configuración', titulo: 'Seguridad de la cuenta', ubicacion: 'Configuración → Seguridad',
    explicacion: 'Contraseña, correo, sesiones activas y las acciones destructivas (archivar o eliminar la cuenta) con confirmación y auditoría.',
    ruta: '/configuracion/seguridad',
  },
  {
    modulo: 'Configuración', titulo: 'Auditoría', ubicacion: 'Configuración → Auditoría',
    explicacion: 'Quién hizo qué y cuándo: ventas, caja, stock, equipo, impresiones y configuración. Se puede buscar por detalle y filtrar por persona y fecha.',
    ruta: '/configuracion/historial',
  },
  {
    modulo: 'Operación', titulo: 'Autorizaciones', ubicacion: 'Autorizaciones → /autorizaciones',
    explicacion: 'Las operaciones fuera de política (descuentos, crédito, anulaciones, ajustes de stock) se piden y se resuelven acá, con trazabilidad en la cronología.',
    ruta: '/autorizaciones',
  },
  {
    modulo: 'Operación', titulo: 'WhatsApp y plantillas', ubicacion: 'Plantillas → /plantillas',
    explicacion: 'Mensajes con variables para cobranzas, campañas y avisos. Se editan en Plantillas y se envían desde la ficha del cliente o del pedido.',
    ruta: '/plantillas',
  },
  {
    modulo: 'Operación', titulo: 'Promociones y combos', ubicacion: 'Promociones → /promociones',
    explicacion: 'Reglas de descuento y combos que se aplican solos en la venta, con vigencia y auditoría.',
    ruta: '/promociones',
  },
  {
    modulo: 'Operación', titulo: 'Cotizaciones y Trade-In', ubicacion: 'Cotizaciones → /cotizaciones · Trade-In → /trade-in',
    explicacion: 'Armá una cotización y compartila por enlace; valuá equipos usados y seguí la pipeline de Trade-In hasta su venta o reparación.',
    ruta: '/cotizaciones',
  },
  {
    modulo: 'Operación', titulo: 'Servicio técnico y garantías', ubicacion: 'Servicio Técnico → /servicio · Garantías → /garantias',
    explicacion: 'Órdenes de taller con estados, costos y checklists; garantías con fotos y seguimiento por cliente.',
    ruta: '/servicio',
  },
  {
    modulo: 'Operación', titulo: 'Compras y proveedores', ubicacion: 'Compras → /compras',
    explicacion: 'Cargá compras, recibí total o parcialmente y devolvé al proveedor. El stock y el costo se actualizan al recibir.',
    ruta: '/compras',
  },
  {
    modulo: 'Operación', titulo: 'Análisis y reportes', ubicacion: 'Análisis → /analisis/reportes',
    explicacion: 'Ventas, ganancias, ranking de productos y asistente. Todo se puede filtrar por fecha y exportar.',
    ruta: '/analisis/reportes',
  },
]

const MODULOS = ['Todo', ...Array.from(new Set(AYUDA.map(entrada => entrada.modulo)))]

const normalizar = (texto) => String(texto || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

export default function Documentacion() {
  const navigate = useNavigate()
  const [busqueda, setBusqueda] = useState('')
  const [modulo, setModulo] = useState('Todo')

  const resultados = useMemo(() => {
    const consulta = normalizar(busqueda.trim())
    return AYUDA.filter(entrada => {
      if (modulo !== 'Todo' && entrada.modulo !== modulo) return false
      if (!consulta) return true
      return normalizar([entrada.titulo, entrada.ubicacion, entrada.explicacion, entrada.modulo].join(' ')).includes(consulta)
    })
  }, [busqueda, modulo])

  return (
    <div className="space-y-4" data-testid="documentacion">
      <div>
        <h2 className="font-bold">Documentación interna</h2>
        <p className="mt-1 text-sm text-mute">
          Dónde se configura cada cosa y cómo funciona la operación. Buscá por tema, pantalla o palabra clave.
        </p>
      </div>

      <Input
        autoFocus
        value={busqueda}
        onChange={event => setBusqueda(event.target.value)}
        aria-label="Buscar en la documentación"
        placeholder="Buscar: PIN, pagos, caja, entrega, seguro…"
      />

      <div className="flex flex-wrap gap-1.5">
        {MODULOS.map(item => (
          <button
            key={item}
            type="button"
            aria-pressed={modulo === item}
            onClick={() => setModulo(item)}
            className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${modulo === item ? 'border-fono bg-fono/15 text-fono-light' : 'border-ink-600 text-mute hover:text-fore'}`}
          >
            {item}
          </button>
        ))}
      </div>

      {resultados.length === 0 ? (
        <EmptyState compact icon="search" title="Sin resultados." description="Probá con otra palabra: PIN, caja, entrega, impresora, precios…" />
      ) : (
        <div className="space-y-2.5">
          {resultados.map(entrada => (
            <Card key={entrada.titulo} className="p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-bold">{entrada.titulo}</h3>
                    <Badge color="blue">{entrada.modulo}</Badge>
                  </div>
                  <p className="mt-1 text-xs font-semibold text-mute">{entrada.ubicacion}</p>
                  <p className="mt-1.5 text-sm text-fore">{entrada.explicacion}</p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate(entrada.ruta)}
                  className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-lg border border-fono/40 px-3 py-2 text-xs font-semibold text-fono-light transition hover:bg-fono/10"
                  aria-label={`Ir a ${entrada.titulo}`}
                >
                  Ir
                  <Icon name="external" className="h-3.5 w-3.5" />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
