import { formatGs } from '@/utils/moneda'
import { ETIQUETA_ESTADO_USUARIO, ETIQUETA_ROL, fechaHora, formatNumero, soloFecha } from '@/lib/superadmin/formato'
import ListaPlataforma, { Datos, useDetalle } from './ListaPlataforma'

const RUTA = '/api/superadmin/empresas'

const COLUMNAS = [
  { clave: 'name', titulo: 'Empresa', render: f => f.name, ancho: 'w-[28%]' },
  { clave: 'email', titulo: 'Correo', render: f => f.email },
  { clave: 'usuarios', titulo: 'Usuarios', render: f => formatNumero(f.usuarios), ancho: 'w-[10%]' },
  { clave: 'pedidos', titulo: 'Pedidos', render: f => formatNumero(f.pedidos), ancho: 'w-[10%]' },
  { clave: 'actividad', titulo: 'Última actividad', render: f => soloFecha(f.ultimaActividad), ancho: 'w-[14%]' },
  { clave: 'estado', titulo: 'Estado', render: f => (f.archivedAt ? 'Archivada' : 'Activa'), ancho: 'w-[10%]' },
]

function DetalleEmpresa({ id }) {
  const { cargando, datos, error } = useDetalle(RUTA, id)
  if (cargando) return <p className="text-sm text-mute" role="status">Cargando…</p>
  if (error || !datos) return <p role="alert" className="text-sm text-bad-text">{error || 'No se encontró la empresa.'}</p>
  return (
    <div className="flex flex-col gap-4" data-testid="detalle-empresa">
      <Datos filas={[
        ['Empresa', datos.name], ['Identificador', datos.slug], ['Correo', datos.email], ['Correo verificado', datos.emailVerifiedAt ? fechaHora(datos.emailVerifiedAt) : 'No'],
        ['RUC', datos.ruc], ['Ciudad', [datos.city, datos.department].filter(Boolean).join(', ')], ['Teléfono', datos.phone], ['Alta', fechaHora(datos.createdAt)],
        ['Estado', datos.archivedAt ? `Archivada el ${soloFecha(datos.archivedAt)}` : 'Activa'], ['Última actividad', fechaHora(datos.ultimaActividad)],
        ['Usuarios', `${formatNumero(datos.usuariosActivos)} activos de ${formatNumero(datos.usuarios)}`], ['Sucursales', formatNumero(datos.sucursales)],
        ['Pedidos (total)', formatNumero(datos.pedidos)], ['Pedidos últimos 30 días', formatNumero(datos.pedidos30)], ['Ventas últimos 30 días', formatGs(datos.ventas30)],
      ]} />
      <section aria-label="Equipo">
        <h3 className="mb-2 text-sm font-semibold text-fore">Equipo</h3>
        <ul className="divide-y divide-ink-600 rounded-xl border border-ink-600">
          {datos.equipo.map(u => (
            <li key={u.id} className="flex flex-wrap items-baseline justify-between gap-x-3 px-3 py-2 text-sm">
              <span className="min-w-0 break-words font-medium text-fore">{u.name}</span>
              <span className="text-xs text-mute">{ETIQUETA_ROL[u.role] || u.role} · {ETIQUETA_ESTADO_USUARIO[u.status] || u.status}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

export default function Empresas() {
  return (
    <ListaPlataforma
      nombre="empresas" ruta={RUTA} columnas={COLUMNAS} placeholder="Buscar por nombre, correo, RUC o identificador"
      detalleTitulo="Detalle de la empresa" DetalleContenido={DetalleEmpresa}
      filtros={[{ clave: 'estado', titulo: 'Estado', opciones: [['', 'Todas'], ['activas', 'Activas'], ['inactivas', 'Sin actividad 30 días'], ['archivadas', 'Archivadas']] }]}
      ordenes={[['alta', 'Alta'], ['nombre', 'Nombre'], ['usuarios', 'Usuarios'], ['pedidos', 'Pedidos'], ['actividad', 'Actividad']]}
    />
  )
}
