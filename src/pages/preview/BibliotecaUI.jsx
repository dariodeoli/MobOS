// Biblioteca de objetos de MobOS (#538): catálogo visual interno con cada objeto
// compartido, sus variantes y estados en claro y oscuro. Vive en `/biblioteca`
// (solo dueño/admin) y en desarrollo en `/biblioteca-ui`; sus valores son
// ficticios y no ejecuta operaciones. Índice de uso: docs/PLANTILLA-OBJETOS.md.
import { useEffect, useState } from 'react'
import {
  Aviso,
  Badge,
  Button,
  Card,
  DataTable,
  Dot,
  EmptyState,
  ErrorState,
  FormField,
  IconAction,
  Input,
  Label,
  Modal,
  MoneyInput,
  Nota,
  PasswordInput,
  Select,
  Skeleton,
  Stat,
  Subtabs,
  Textarea,
  useToast,
} from '@/components/ui'
import Avatar from '@/components/shared/Avatar'
import EmailField from '@/components/shared/EmailField'
import FieldRow from '@/components/shared/FieldRow'
import { GRILLA_DOS_COLUMNAS } from '@/components/shared/formulario'
import PhoneField from '@/components/shared/PhoneField'
import PinPad from '@/components/shared/PinPad'
import Popup from '@/components/shared/Popup'
import SearchField from '@/components/shared/SearchField'
import SegmentedField from '@/components/shared/SegmentedField'
import Switch from '@/components/shared/Switch'
import RucField from '@/components/shared/RucField'
import StatusChip from '@/components/shared/StatusChip'
import { temaOscuro } from '@/lib/tema'

const FILAS = [
  { id: 'demo-1', pedido: 'MOB-31843', cliente: 'Cliente de muestra', total: 'Gs. 780.000', estado: 'PENDING' },
  { id: 'demo-2', pedido: 'MOB-31842', cliente: 'Tienda de ejemplo S.A.', total: 'Gs. 1.250.000', estado: 'COMPLETED' },
]

const COLUMNAS = [
  { key: 'pedido', label: 'Pedido' },
  { key: 'cliente', label: 'Cliente' },
  { key: 'total', label: 'Total', align: 'right' },
  { key: 'estado', label: 'Estado', render: fila => <StatusChip dominio="pedido" estado={fila.estado} /> },
]

const SECCIONES = [
  ['primitivas', 'Acciones'],
  ['campos', 'Campos'],
  ['identidad', 'Identidad'],
  ['datos', 'Datos'],
  ['estados', 'Estados'],
  ['popups', 'Popups'],
  ['pin', 'PIN'],
  ['chips', 'Chips y avisos'],
]

function Muestra({ titulo, detalle, children, className = '' }) {
  return (
    <section className={`min-w-0 rounded-2xl border border-ink-600 bg-ink p-4 shadow-card sm:p-5 ${className}`}>
      <div className="mb-4">
        <h2 className="text-base font-semibold">{titulo}</h2>
        {detalle && <p className="mt-1 text-sm text-mute">{detalle}</p>}
      </div>
      {children}
    </section>
  )
}

export default function BibliotecaUI() {
  const temaOriginal = temaOscuro()
  const [oscuro, setOscuro] = useState(temaOriginal)
  const [pestana, setPestana] = useState('botones')
  const [modalAbierto, setModalAbierto] = useState(false)
  const [monto, setMonto] = useState('1250000')
  const [ruc, setRuc] = useState('80000000-0')
  const [telefono, setTelefono] = useState('981234567')
  const [popup, setPopup] = useState(null)
  const [activo, setActivo] = useState(true)
  const [periodo, setPeriodo] = useState('mes')
  const [busqueda, setBusqueda] = useState('')
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState(false)
  const [pinOk, setPinOk] = useState(false)
  const toast = useToast()
  const cerrarPopup = () => setPopup(null)
  // PIN de muestra: 1234 es válido; nunca se envía a ningún servicio.
  const validarPin = (valor) => {
    if (valor === '1234') { setPinError(false); setPinOk(true) } else { setPinError(true); setPinOk(false); setTimeout(() => setPin(''), 600) }
  }

  useEffect(() => {
    document.documentElement.classList.toggle('dark', oscuro)
    return () => document.documentElement.classList.toggle('dark', temaOriginal)
  }, [oscuro, temaOriginal])

  return (
    <main className="min-h-dvh bg-paper px-3 py-4 text-fore sm:px-6 sm:py-6" data-testid="biblioteca-ui">
      <div className="mx-auto w-full max-w-7xl space-y-5">
        <header className="flex flex-col gap-3 rounded-2xl border border-ink-600 bg-ink p-4 shadow-card sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[.16em] text-fono-dark dark:text-fono">MobOS · UI compartida</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Biblioteca visual</h1>
            <p className="mt-2 max-w-2xl text-sm text-mute">Componentes actuales y sus estados. Los ejemplos son ficticios y no guardan ni envían datos.</p>
          </div>
          <Button type="button" variant="outline" onClick={() => setOscuro(valor => !valor)} aria-pressed={oscuro} className="w-full shrink-0 sm:w-auto">
            {oscuro ? 'Ver tema claro' : 'Ver tema oscuro'}
          </Button>
        </header>

        <nav aria-label="Secciones del catálogo" className="flex gap-2 overflow-x-auto pb-1">
          {SECCIONES.map(([id, nombre]) => (
            <a key={id} href={`#${id}`} className="inline-flex min-h-10 shrink-0 items-center rounded-full border border-ink-600 bg-ink px-3 text-sm font-medium text-fore hover:border-fono focus-visible:outline focus-visible:outline-2 focus-visible:outline-fono">{nombre}</a>
          ))}
        </nav>

        <div className="grid min-w-0 gap-4 lg:grid-cols-2">
          <Muestra titulo="Acciones y navegación" detalle="Variantes del botón, acción compacta y pestañas compartidas." className="lg:col-span-2">
            <div id="primitivas" className="space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button">Principal</Button>
                <Button type="button" variant="outline">Secundario</Button>
                <Button type="button" variant="success">Confirmar</Button>
                <Button type="button" variant="danger">Acción delicada</Button>
                <Button type="button" variant="ghost">Discreto</Button>
                <IconAction icon="edit" label="Editar elemento de muestra" tone="fono" />
                <IconAction icon="clock" label="Ver historial de muestra" />
              </div>
              <Subtabs value={pestana} onChange={setPestana} ariaLabel="Variantes de botones" items={[["botones", 'Botones'], ["estados", 'Estados'], ["acciones", 'Acciones']]} />
              <p className="text-xs text-mute" aria-live="polite">Pestaña activa: {pestana}. La navegación cambia solo este estado local.</p>
              <Button type="button" variant="outline" onClick={() => setModalAbierto(true)}>Abrir diálogo de muestra</Button>
            </div>
          </Muestra>

          <Muestra titulo="Campos y formulario" detalle="Etiquetas, ayuda, error, contraseña y monto con tokens existentes.">
            <div id="campos" className="grid gap-4 sm:grid-cols-2">
              <FormField label="Correo" htmlFor="catalogo-correo" hint="Texto de ayuda del campo">
                <EmailField id="catalogo-correo" defaultValue="persona@ejemplo.test" />
              </FormField>
              <FormField label="RUC de muestra" htmlFor="catalogo-ruc" error="Formato visual de error; no valida un RUC real.">
                <RucField id="catalogo-ruc" esDemo value={ruc} onChange={setRuc} consultarDisabled />
              </FormField>
              <FormField label="Teléfono" htmlFor="catalogo-telefono" hint="Control de teléfono compartido">
                <PhoneField id="catalogo-telefono" value={telefono} onChange={setTelefono} />
              </FormField>
              <div><Label htmlFor="catalogo-input">Búsqueda</Label><Input id="catalogo-input" placeholder="Buscar en la muestra" defaultValue="Pedido de muestra" /></div>
              <div><Label htmlFor="catalogo-select">Sucursal</Label><Select id="catalogo-select" defaultValue="centro"><option value="centro">Sucursal de muestra</option><option value="norte">Otra sucursal</option></Select></div>
              <div><Label htmlFor="catalogo-password">Contraseña</Label><PasswordInput id="catalogo-password" defaultValue="muestra-segura" /></div>
              <div className="sm:col-span-2"><Label htmlFor="catalogo-nota">Nota</Label><Textarea id="catalogo-nota" rows={2} defaultValue="Texto de ejemplo para revisar el campo." /></div>
              <div><Label htmlFor="catalogo-buscar">Buscador</Label><SearchField id="catalogo-buscar" value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar producto o IMEI" aria-label="Buscar producto o IMEI" /></div>
              <div className="flex items-center gap-3"><Switch id="catalogo-activo" checked={activo} onChange={e => setActivo(e.target.checked)} aria-label="Activo" /><Label htmlFor="catalogo-activo" className="mb-0">Activo</Label></div>
              <div className="sm:col-span-2"><SegmentedField value={periodo} onChange={setPeriodo} options={[['dia', 'Día'], ['semana', 'Semana'], ['mes', 'Mes']]} /></div>
              <div className="sm:col-span-2"><FieldRow label="Monto" htmlFor="catalogo-monto" hint="Entrada formateada localmente"><MoneyInput id="catalogo-monto" value={monto} onValueChange={valor => setMonto(String(valor))} /></FieldRow></div>
            </div>
          </Muestra>

          <Muestra titulo="Identidad y estados de pedido" detalle="Avatar e indicadores semánticos compartidos.">
            <div id="identidad" className="flex flex-wrap items-center gap-3">
              <Avatar user={{ id: 'catalogo-persona', name: 'Persona de muestra', hasAvatar: false }} size="lg" />
              <div><p className="font-medium">Persona de muestra</p><p className="text-sm text-mute">Avatar por iniciales</p></div>
              <div className="flex flex-wrap gap-2 sm:ml-auto"><StatusChip dominio="pedido" estado="PENDING" /><StatusChip dominio="pedido" estado="COMPLETED" /></div>
            </div>
          </Muestra>

          <Muestra titulo="Tarjetas y métricas" detalle="Superficie, cifra y estados de marca.">
            <div className={GRILLA_DOS_COLUMNAS}>
              <Stat label="Pedidos de muestra" valor="24" sub="Datos ilustrativos" />
              <Card className="space-y-3"><div className="flex items-center justify-between gap-2"><h3 className="font-semibold">Resumen</h3><Badge color="green">Activo</Badge></div><p className="text-sm text-mute">Tarjeta compartida con contenido adaptable.</p><div className="flex items-center gap-2 text-sm"><Dot color="green" /> Estado conectado</div></Card>
            </div>
          </Muestra>

          <Muestra titulo="Tabla adaptable" detalle="En móvil cada fila se presenta como ficha; en escritorio, como tabla.">
            <div id="datos"><DataTable columns={COLUMNAS} rows={FILAS} caption="Pedidos de muestra" getRowKey={fila => fila.id} /></div>
          </Muestra>

          <Muestra titulo="Cargando, vacío, error y avisos" detalle="Estados reutilizables sin solicitudes de red.">
            <div id="estados" className="space-y-3">
              <div role="status" aria-label="Cargando muestra" className="space-y-2"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-10 w-full" /></div>
              <div className={GRILLA_DOS_COLUMNAS}><EmptyState compact title="Sin resultados de muestra" description="El estado vacío explica el siguiente paso." /><ErrorState compact title="Error de muestra" description="Este mensaje no corresponde a una operación real." /></div>
              <div className="grid gap-2 sm:grid-cols-2"><Aviso tono="ok">Aviso de confirmación</Aviso><Aviso tono="warn">Aviso preventivo</Aviso><Nota tono="info">Nota informativa</Nota></div>
            </div>
          </Muestra>

          <Muestra titulo="Popup único" detalle="Un solo marco: encabezado con X roja, cuerpo libre y pie de acciones. En móvil sube como hoja; en escritorio va centrado." className="lg:col-span-2">
            <div id="popups" className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => setPopup('confirmar')}>Confirmar</Button>
              <Button type="button" variant="outline" onClick={() => setPopup('peligro')}>Confirmar (peligro)</Button>
              <Button type="button" variant="outline" onClick={() => setPopup('formulario')}>Formulario</Button>
              <Button type="button" variant="outline" onClick={() => setPopup('detalle')}>Detalle</Button>
              <Button type="button" variant="outline" onClick={() => setPopup('aviso')}>Aviso</Button>
            </div>
          </Muestra>

          <Muestra titulo="Teclado de PIN" detalle="Teclas redondas grandes, cuatro puntos, borrar y validación al completar (de muestra: 1234 es correcto).">
            <div id="pin" className="space-y-2">
              <PinPad tecladoTactil value={pin} onChange={v => { setPinError(false); setPinOk(false); setPin(v) }} onComplete={validarPin} invalido={pinError} exito={pinOk} ariaLabel="PIN de muestra" />
              <p role="status" className={`text-center text-sm ${pinError ? 'text-bad-text' : 'text-mute'}`}>{pinError ? 'PIN incorrecto' : pinOk ? 'PIN correcto' : 'Se valida solo al completar.'}</p>
            </div>
          </Muestra>

          <Muestra titulo="Chips, insignias y avisos" detalle="Estados semánticos, toasts y avisos en línea.">
            <div id="chips" className="space-y-3">
              <div className="flex flex-wrap gap-2"><Badge color="green">Activo</Badge><Badge color="orange">Pendiente</Badge><Badge color="red">Vencido</Badge><Badge color="slate">Borrador</Badge><StatusChip dominio="pedido" estado="PENDING" /><StatusChip dominio="pedido" estado="COMPLETED" /></div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => toast.success('Cliente se guardó')}>Toast de éxito</Button>
                <Button type="button" variant="outline" onClick={() => toast.error('No se pudo guardar', 'Revisá los datos y probá de nuevo.')}>Toast de error</Button>
              </div>
              <Aviso tono="error">Aviso de error</Aviso>
            </div>
          </Muestra>
        </div>
      </div>

      <Popup open={popup === 'confirmar'} onClose={cerrarPopup} tipo="confirmar" title="¿Guardar los cambios?" description="Se aplican a esta sucursal." acciones={{ primaria: { label: 'Guardar', onClick: cerrarPopup }, secundaria: { label: 'Volver', onClick: cerrarPopup } }}>
        <p className="text-mute">Confirmación de muestra: no guarda nada.</p>
      </Popup>
      <Popup open={popup === 'peligro'} onClose={cerrarPopup} tipo="confirmar" title="¿Anular la venta?" acciones={{ peligro: { label: 'Anular venta', onClick: cerrarPopup }, secundaria: { label: 'Volver', onClick: cerrarPopup } }}>
        <p className="text-mute">Esta acción de muestra no se puede deshacer.</p>
      </Popup>
      <Popup open={popup === 'formulario'} onClose={cerrarPopup} tipo="formulario" title="Nuevo cliente" acciones={{ primaria: { label: 'Guardar cliente', onClick: cerrarPopup }, secundaria: { label: 'Cancelar', onClick: cerrarPopup } }}>
        <div className="space-y-3"><FormField label="Nombre" htmlFor="popup-nombre"><Input id="popup-nombre" placeholder="Nombre y apellido" /></FormField><FormField label="Teléfono" htmlFor="popup-tel"><PhoneField id="popup-tel" value={telefono} onChange={setTelefono} /></FormField></div>
      </Popup>
      <Popup open={popup === 'detalle'} onClose={cerrarPopup} tipo="detalle" title="Pedido MOB-31843" footer={<div className="flex justify-end"><Button type="button" variant="outline" className="min-h-11" onClick={cerrarPopup}>Cerrar</Button></div>}>
        <DataTable columns={COLUMNAS} rows={FILAS} caption="Pedidos de muestra" getRowKey={fila => fila.id} />
      </Popup>
      <Popup open={popup === 'aviso'} onClose={cerrarPopup} tipo="aviso" tono="warn" title="Sin conexión" acciones={{ primaria: { label: 'Entendido', onClick: cerrarPopup } }}>
        <p className="text-mute">Guardamos la venta en este equipo y la enviamos al volver la conexión.</p>
      </Popup>

      <Modal open={modalAbierto} onClose={() => setModalAbierto(false)} title="Diálogo de muestra">
        <p className="text-sm text-mute">Este diálogo solo permite revisar el contenedor y el cierre. No ejecuta cambios.</p>
        <div className="mt-5 flex justify-end"><Button type="button" onClick={() => setModalAbierto(false)}>Cerrar</Button></div>
      </Modal>
    </main>
  )
}
