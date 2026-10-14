import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSesion } from '@/lib/sesion'
import { api } from '@/lib/api/client'
import { Aviso, Badge, Button, EmptyState, Subtabs } from '@/components/ui'
import Avatar from '@/components/shared/Avatar'
import Icon from '@/components/shared/Icon'
import ListaDensa from '@/components/shared/ListaDensa'
import { usePaginaLista } from '@/components/shared/usePaginaLista'
import { CELDA_DATO, CELDA_IDENTIDAD } from '@/components/shared/tabla'
import { descargarCsvCliente } from '@/utils/descargarArchivo'
import { getVendedores } from '@/lib/storage'
import { GrupoConfig, FilaConfig } from './FilasConfig'
import { FILTROS_USUARIOS, ESTADOS_USUARIO, contarUsuarios, csvUsuarios, filasUsuarios, filtrarUsuarios } from './modeloUsuarios'

// #422 · Usuarios (Equipo y acceso): tabla con estado, rol y aviso de seguridad,
// filtros Todos · Activos · Pendientes · Solo POS y las acciones Exportar y
// Agregar usuarios. «Roles» y «Seguridad» quedan como subsecciones (filas
// debajo de la tabla). La gestión fina de cada persona (horario, PIN, permisos)
// sigue en Miembros: tocar una fila lleva allí.
export default function UsuariosTabla({ onGestionar, onAgregar, onRoles }) {
  const { esDemo } = useSesion()
  const navigate = useNavigate()
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [filtro, setFiltro] = useState('todos')

  useEffect(() => {
    // La demo no llama a la API: lista el equipo ficticio con la misma forma.
    if (esDemo) {
      const usuarios = getVendedores().map((v) => ({ id: v.id, name: v.nombre, email: v.email || '', role: v.role || 'VENDEDOR', status: v.activo ? 'ACTIVE' : 'INACTIVE', branchId: v.branchId || null, hasAvatar: Boolean(v.hasAvatar) }))
      setDatos({ usuarios, invitaciones: [], sucursales: [] })
      return undefined
    }
    let vivo = true
    Promise.all([api.get('/api/users'), api.get('/api/user-invitations'), api.get('/api/branches')])
      .then(([usuarios, invitaciones, sucursales]) => { if (vivo) setDatos({ usuarios, invitaciones, sucursales }) })
      .catch((cause) => { if (vivo) setError(cause?.message || 'No se pudo cargar el equipo.') })
    return () => { vivo = false }
  }, [esDemo])

  const filas = useMemo(() => filasUsuarios(datos || {}), [datos])
  const conteo = useMemo(() => contarUsuarios(filas), [filas])
  const visibles = useMemo(() => filtrarUsuarios(filas, filtro), [filas, filtro])
  const lista = usePaginaLista(visibles, { tamano: { compacto: 10, amplio: 25 } })

  function exportar() { descargarCsvCliente(`usuarios-${filtro}.csv`, csvUsuarios(visibles)) }

  const identidad = (fila) => (
    <span className="flex min-w-0 items-center gap-2.5">
      <Avatar user={{ id: fila.id, name: fila.nombre, hasAvatar: fila.hasAvatar }} size="md" />
      <span className="min-w-0">
        <span className={`block ${CELDA_IDENTIDAD}`}>{fila.nombre}</span>
        {fila.correo && <span className={`block ${CELDA_DATO}`}>{fila.correo}</span>}
      </span>
    </span>
  )
  const estado = (fila) => <Badge color={ESTADOS_USUARIO[fila.estado]?.color || 'slate'}>{ESTADOS_USUARIO[fila.estado]?.etiqueta || fila.estado}</Badge>
  const seguridad = (fila) => fila.aviso
    ? <span title={fila.aviso} role="img" aria-label={fila.aviso} className="inline-flex text-warn"><Icon name="alert" className="h-4 w-4" aria-hidden="true" /></span>
    : <span className="text-mute" aria-label="Sin avisos">—</span>

  return (
    <div className="space-y-4" data-testid="usuarios-pantalla">
      {error && <Aviso tono="error">{error}</Aviso>}
      <div data-config-anchor="usuarios" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Subtabs
            value={filtro}
            onChange={setFiltro}
            items={FILTROS_USUARIOS.map(([id, etiqueta]) => [id, etiqueta, conteo[id]])}
            ariaLabel="Filtrar usuarios"
            className="[&>button]:min-h-11 md:[&>button]:min-h-9"
          />
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" data-testid="usuarios-exportar" onClick={exportar} disabled={!visibles.length}>
              <Icon name="download" className="h-4 w-4" aria-hidden="true" />Exportar
            </Button>
            <Button type="button" data-testid="usuarios-agregar" onClick={onAgregar}>
              <Icon name="plus" className="h-4 w-4" aria-hidden="true" />Agregar usuarios
            </Button>
          </div>
        </div>
        {datos && !visibles.length ? (
          <EmptyState
            compact
            icon="users"
            title="No hay usuarios en este filtro."
            description="Probá con otro filtro o sumá a una persona."
          />
        ) : (
          <ListaDensa
            lista={lista}
            testId="usuarios-tabla"
            etiquetaTabla="Usuarios del equipo"
            etiquetaPie="Páginas de usuarios"
            unidad="usuarios"
            obtenerClave={(fila) => fila.id}
            alAbrir={(fila) => (fila.tipo === 'usuario' ? onGestionar?.(fila) : onAgregar?.(fila))}
            atributosFila={(fila) => ({ 'data-testid': 'usuario-fila', 'data-estado': fila.estado })}
            columns={[
              { key: 'usuario', header: 'Usuario', ancho: 'minmax(0,2.4fr)', cell: identidad },
              { key: 'estado', header: 'Estado', ancho: '6rem', cell: estado },
              { key: 'rol', header: 'Rol', ancho: 'minmax(0,1fr)', className: 'text-xs text-mute', cell: (fila) => fila.rolEtiqueta },
              { key: 'sucursal', header: 'Sucursal', ancho: 'minmax(0,1fr)', className: 'text-xs text-mute', cell: (fila) => fila.sucursal },
              { key: 'seguridad', header: 'Seguridad', ancho: '5.5rem', cell: seguridad },
            ]}
            renderCard={(fila) => (
              <div className="space-y-2">
                {identidad(fila)}
                <div className="flex flex-wrap items-center gap-2 text-xs text-mute">
                  {estado(fila)}<span>{fila.rolEtiqueta}</span><span>· {fila.sucursal}</span>
                  {fila.aviso && <span className="inline-flex items-center gap-1 text-warn"><Icon name="alert" className="h-3.5 w-3.5" aria-hidden="true" />{fila.aviso}</span>}
                </div>
              </div>
            )}
          />
        )}
      </div>

      <GrupoConfig titulo="Más sobre el equipo" anchor="usuarios-secciones">
        <FilaConfig icono="shield" titulo="Roles y permisos" descripcion="Qué puede hacer cada rol, incluido ver costos." onClick={onRoles} testId="fila-roles" />
        <FilaConfig icono="lock" titulo="Seguridad" descripcion="Sesiones, contraseña, PIN y acciones sensibles." onClick={() => navigate('/configuracion/seguridad')} testId="fila-seguridad" />
      </GrupoConfig>
    </div>
  )
}
