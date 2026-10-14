import { ETIQUETA_ESTADO_USUARIO, ETIQUETA_ROL, fechaHora, formatNumero, soloFecha } from '@/lib/superadmin/formato'
import ListaPlataforma, { Datos, useDetalle } from './ListaPlataforma'

const RUTA = '/api/superadmin/usuarios'

const COLUMNAS = [
  { clave: 'name', titulo: 'Usuario', render: f => f.name, ancho: 'w-[24%]' },
  { clave: 'email', titulo: 'Correo', render: f => f.email },
  { clave: 'empresa', titulo: 'Empresa', render: f => f.empresa, ancho: 'w-[20%]' },
  { clave: 'role', titulo: 'Rol', render: f => ETIQUETA_ROL[f.role] || f.role, ancho: 'w-[10%]' },
  { clave: 'status', titulo: 'Estado', render: f => ETIQUETA_ESTADO_USUARIO[f.status] || f.status, ancho: 'w-[10%]' },
  { clave: 'acceso', titulo: 'Último acceso', render: f => soloFecha(f.lastAccessAt), ancho: 'w-[12%]' },
]

function DetalleUsuario({ id }) {
  const { cargando, datos, error } = useDetalle(RUTA, id)
  if (cargando) return <p className="text-sm text-mute" role="status">Cargando…</p>
  if (error || !datos) return <p role="alert" className="text-sm text-bad-text">{error || 'No se encontró el usuario.'}</p>
  const horas = Math.round((Number(datos.segundosActivos) || 0) / 3600)
  return (
    <div data-testid="detalle-usuario">
      <Datos filas={[
        ['Nombre', datos.name], ['Correo', datos.email], ['Empresa', datos.empresa], ['Rol', ETIQUETA_ROL[datos.role] || datos.role],
        ['Estado', ETIQUETA_ESTADO_USUARIO[datos.status] || datos.status], ['Alta', fechaHora(datos.createdAt)], ['Último acceso', fechaHora(datos.lastAccessAt)],
        ['Última actividad', fechaHora(datos.ultimaActividad)], ['Tiempo activo acumulado', `${formatNumero(horas)} h`],
        ['Sesiones abiertas', formatNumero(datos.sesionesAbiertas)], ['Pedidos vendidos', formatNumero(datos.pedidos)],
      ]} />
    </div>
  )
}

export default function Usuarios() {
  return (
    <ListaPlataforma
      nombre="usuarios" ruta={RUTA} columnas={COLUMNAS} placeholder="Buscar por nombre, correo o empresa"
      detalleTitulo="Detalle del usuario" DetalleContenido={DetalleUsuario}
      filtros={[
        { clave: 'estado', titulo: 'Estado', opciones: [['', 'Todos los estados'], ['ACTIVE', 'Activos'], ['INACTIVE', 'Inactivos'], ['SUSPENDED', 'Suspendidos']] },
        { clave: 'rol', titulo: 'Rol', opciones: [['', 'Todos los roles'], ...Object.entries(ETIQUETA_ROL)] },
      ]}
      ordenes={[['alta', 'Alta'], ['nombre', 'Nombre'], ['acceso', 'Último acceso'], ['empresa', 'Empresa']]}
    />
  )
}
