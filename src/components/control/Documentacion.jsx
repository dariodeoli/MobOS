import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUltimoUsado } from '@/hooks/useUltimoUsado'
import { Badge, Card, EmptyState } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import SearchField from '@/components/shared/SearchField'

// Documentación interna: dónde se configura cada cosa y cómo funciona. Cada
// resultado lleva la ubicación exacta, una explicación breve y un enlace
// directo a la pantalla. El buscador ignora mayúsculas y acentos.
const AYUDA = [
  {
    modulo: 'POS', titulo: 'Cargar una venta', ubicacion: 'POS → /ventas',
    explicacion: 'Elegí el cliente, buscá productos por nombre, modelo o IMEI, ajustá cantidades y cobrá. El vendedor se asigna solo según quién está operando.',
    ruta: '/pos',
  },
  {
    modulo: 'POS', titulo: 'Pagos divididos', ubicacion: 'POS → /ventas · bloque de cobros',
    explicacion: 'Agregá un pago por cada medio o cuenta, dividí el importe y mirá el saldo restante. Con pago completo el botón es Confirmar venta; con saldo, Crear pedido.',
    ruta: '/pos',
  },
  {
    modulo: 'POS', titulo: 'Bloqueo de pantalla y PIN', ubicacion: 'Barra superior → menú de tres puntos',
    explicacion: 'La pantalla se bloquea sola por inactividad (10 minutos por defecto) o con Bloquear pantalla. Se desbloquea con el PIN personal, que valida solo al completarlo.',
    ruta: '/pos',
  },
  {
    modulo: 'POS', titulo: 'Preferencias y notificaciones', ubicacion: 'Barra superior → menú de tres puntos → Preferencias',
    explicacion: 'Cambiá el tema claro/oscuro, los minutos de bloqueo y si querés ver el aviso de novedades. El panel de notificaciones junta pedidos, aprobaciones, comentarios y menciones.',
    ruta: '/pos',
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
    modulo: 'Clientes', titulo: 'Seguro del cliente (interruptor y %)', ubicacion: 'Clientes → ficha → Datos → Seguro del cliente',
    explicacion: 'Activalo con el interruptor y cargá el porcentaje del cliente; si lo dejás vacío usa el % de la empresa (Finanzas). El seguro se suma al costo real de la venta y ajusta el margen. Lo configura administración o gerencia.',
    ruta: '/clientes',
  },
  {
    modulo: 'Clientes', titulo: 'Etiquetas del cliente', ubicacion: 'Clientes → ficha → Datos → Etiquetas',
    explicacion: 'Separadas por coma (mayorista, prioridad…); agrupan fichas y el buscador las encuentra junto con nombre, teléfono, RUC, correo, ciudad, direcciones y notas.',
    ruta: '/clientes',
  },
  {
    modulo: 'Clientes', titulo: 'Nota interna y nota pública', ubicacion: 'Clientes → ficha → Datos',
    explicacion: 'La nota interna es solo del equipo: nunca se muestra al cliente. La nota pública se comparte en el portal del cliente (enlace por QR y vitrina) como “Nota de la tienda”.',
    ruta: '/clientes',
  },
  {
    modulo: 'Clientes', titulo: 'Crédito y autorizaciones del cliente', ubicacion: 'Clientes → ficha → Datos → Configuración comercial · Autorizaciones → /autorizaciones',
    explicacion: 'Tipo (final/mayorista), crédito, días y límite los cambia administración o gerencia. Un vendedor sin permiso deja la solicitud: gerencia la aprueba, la rechaza o autoriza menos (por ejemplo 7 de 10 días) y todo queda en la cronología.',
    ruta: '/clientes',
  },
  {
    modulo: 'Clientes', titulo: 'Cronología del cliente', ubicacion: 'Clientes → ficha → Cronología',
    explicacion: 'Pedidos, pagos, entregas, saldo, cambios de datos, solicitudes de crédito, garantías y comentarios, con foto, usuario y fecha/hora. Carga los últimos 20 eventos y Cargar más suma el resto.',
    ruta: '/clientes',
  },
  {
    modulo: 'Clientes', titulo: 'Informe del cliente', ubicacion: 'Clientes → ficha → Estadísticas → Descargar informe',
    explicacion: 'CSV con datos, facturación, direcciones, pedidos, compras mensuales, deudas y garantías. Se elige el período: todo, este año, últimos 12 meses o personalizado.',
    ruta: '/clientes',
  },
  {
    modulo: 'Inventario', titulo: 'Seguro por producto', ubicacion: 'Productos → ficha del producto → Seguro',
    explicacion: 'Porcentaje de seguro del producto que suma al costo real. Si el cliente tiene su seguro activo, su porcentaje (o el de la empresa) gana sobre la política general.',
    ruta: '/productos',
  },
  {
    modulo: 'Garantías', titulo: 'Registrar un caso de garantía', ubicacion: 'Garantías → /garantias → botón Nuevo caso',
    explicacion: 'Cliente, serial, descripción y sucursal; opcional: días de garantía (calcula el vencimiento), cobertura, exclusiones, repuestos y fotos del estado del equipo.',
    ruta: '/garantias',
  },
  {
    modulo: 'Garantías', titulo: 'Estados y avance de la garantía', ubicacion: 'Garantías → columna Estado',
    explicacion: 'Recibido → En diagnóstico → Listo → Entregado. El tilde de la fila avanza al siguiente estado y cada cambio queda en la cronología del cliente.',
    ruta: '/garantias',
  },
  {
    modulo: 'Garantías', titulo: 'Enlace público y QR del caso', ubicacion: 'Garantías → fila → icono del enlace (· Regenerar enlace)',
    explicacion: 'Muestra al cliente modelo, días restantes, cobertura y exclusiones, sin datos internos. El enlace se copia al crear el caso; si se filtró, Regenerar enlace emite uno nuevo y el anterior deja de funcionar.',
    ruta: '/garantias',
  },
  {
    modulo: 'Garantías', titulo: 'Garantías en el portal del cliente', ubicacion: 'Clientes → ficha → Portal del cliente (nivel completo)',
    explicacion: 'El enlace de nivel completo lista las garantías activas del cliente con estado, serial y vencimiento, sin costos ni notas internas.',
    ruta: '/clientes',
  },
  {
    modulo: 'Servicio Técnico', titulo: 'Pipeline del taller', ubicacion: 'Servicio Técnico → /servicio → columna Estado',
    explicacion: 'Recibido → Diagnóstico → Con técnico → Esperando repuesto → Reparado → Listo para retirar → Entregado. El botón de la fila avanza al siguiente estado.',
    ruta: '/servicio',
  },
  {
    modulo: 'Servicio Técnico', titulo: 'Checklists de recepción', ubicacion: 'Servicio Técnico → Nueva orden → Configurar',
    explicacion: 'Puntos que se revisan al recibir (por ejemplo Face ID o batería), configurables por tipo de dispositivo; la orden guarda lo marcado.',
    ruta: '/servicio',
  },
  {
    modulo: 'Servicio Técnico', titulo: 'Costos y utilidad de la orden', ubicacion: 'Servicio Técnico → Nueva orden → Repuesto, Mano de obra y Otros',
    explicacion: 'El costo del trabajo se desglosa y la utilidad se calcula contra el precio cobrado; la fila la muestra en verde o rojo.',
    ruta: '/servicio',
  },
  {
    modulo: 'Servicio Técnico', titulo: 'WhatsApp por estado de la orden', ubicacion: 'Servicio Técnico → fila → icono de WhatsApp (el botón chico elige la plantilla)',
    explicacion: 'El menú central sugiere la plantilla del estado (Equipo recibido, Diagnóstico, Esperando repuesto, Reparado, Listo para retirar) con los datos de la orden; se previsualiza y edita antes de abrir el chat.',
    ruta: '/servicio',
  },
  {
    modulo: 'Servicio Técnico', titulo: 'Impresión de recepción y reporte', ubicacion: 'Servicio Técnico → fila → iconos de impresión',
    explicacion: 'Recepción en A4 y 80 mm, reporte técnico y envío a la ticketera de la sucursal.',
    ruta: '/servicio',
  },
  {
    modulo: 'Garantías', titulo: 'Pasar una garantía al taller',
    ubicacion: 'Servicio y Garantías → Todo → fila de la garantía → Pasar a servicio',
    explicacion: 'Una garantía puede ingresar a servicio: se crea la orden con el equipo, el serial y el diagnóstico del caso. Las dos fichas conservan el historial y la garantía queda marcada “En servicio”.',
    ruta: '/servicio',
  },
  {
    modulo: 'Servicio Técnico', titulo: 'Servicio y garantías en una sola sección',
    ubicacion: 'Stock y servicio → Servicio y Garantías (solapas Todo, Servicio y Garantías)',
    explicacion: 'Las órdenes del taller y las garantías conviven en una sección: la solapa Todo las lista juntas y cada registro muestra su tipo (Servicio o Garantía). /garantias sigue abriendo la solapa de garantías.',
    ruta: '/servicio',
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
    explicacion: 'Mensajes con variables por contexto (Clientes, Pedidos, Servicio Técnico, Cobranzas). Se editan en Plantillas y se envían con el menú central desde la ficha del cliente, del pedido o de la orden de servicio.',
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
  // Módulo de la documentación: último usado como predeterminado (#209).
  const [modulo, recordarModulo] = useUltimoUsado('config:documentacion-modulo', 'Todo', {
    valido: (valor) => MODULOS.includes(valor),
  })

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

      <SearchField
        autoFocus
        value={busqueda}
        onChange={event => setBusqueda(event.target.value)}
        ariaLabel="Buscar en la documentación"
        placeholder="Buscar: PIN, pagos, caja, entrega, seguro…"
      />

      <div className="flex flex-wrap gap-1.5">
        {MODULOS.map(item => (
          <button
            key={item}
            type="button"
            aria-pressed={modulo === item}
            onClick={() => recordarModulo(item)}
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
