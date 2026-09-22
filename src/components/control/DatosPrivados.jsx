import { useEffect, useState } from 'react'
import { Aviso, Badge, Button, Card, Input, Label, Textarea } from '@/components/ui'
import {
  createAccountHolder, createPrivateCompany, getAccountHolders, getPrivateCompanies,
  nombreCompleto, updateAccountHolder, updatePrivateCompany,
} from '@/lib/accountParties'

// Datos privados de la tienda (#143): empresas/personas jurídicas y titulares
// de cuentas. Viven separados del perfil público y solo los ve el dueño.
// Se ofrecen como titulares al configurar cuentas de cobro.

const VACIO_TITULAR = { firstName: '', middleName: '', otherName: '', lastName: '', secondLastName: '', document: '', isActive: true }
const VACIO_EMPRESA = { legalName: '', ruc: '', legalAddress: '', notes: '', isActive: true }

function ListaVacia({ texto }) {
  return <p className="rounded-lg border border-dashed border-ink-600 px-3 py-4 text-center text-xs text-mute">{texto}</p>
}

function FilaEntidad({ titulo, detalle, activo, onEditar, onAlternar, busy, ariaEditar, ariaAlternar }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink-600 px-2.5 py-2">
      <span className="min-w-0">
        <b className="block truncate text-[13px]">{titulo}</b>
        <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-mute">
          <Badge color={activo ? 'green' : 'slate'} className="px-1.5 py-0 text-[10px]">{activo ? 'Activo' : 'Inactivo'}</Badge>
          {detalle && <span className="truncate">{detalle}</span>}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5">
        <Button type="button" variant="outline" className="h-8 px-2 text-xs" disabled={busy} aria-label={ariaEditar} onClick={onEditar}>Editar</Button>
        <Button type="button" variant="ghost" className="h-8 px-2 text-xs" disabled={busy} aria-label={ariaAlternar} onClick={onAlternar}>{activo ? 'Desactivar' : 'Activar'}</Button>
      </span>
    </div>
  )
}

export default function DatosPrivados() {
  const [holders, setHolders] = useState([])
  const [companies, setCompanies] = useState([])
  const [titular, setTitular] = useState(null)
  const [empresa, setEmpresa] = useState(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)

  useEffect(() => {
    let activo = true
    Promise.all([getAccountHolders(), getPrivateCompanies()])
      .then(([nextHolders, nextCompanies]) => { if (activo) { setHolders(nextHolders); setCompanies(nextCompanies) } })
      .catch((error) => { if (activo) setMessage({ ok: false, text: error.message || 'No se pudieron cargar los datos privados.' }) })
    return () => { activo = false }
  }, [])

  async function guardar(accion, exito, cerrar) {
    if (busy) return
    setBusy(true); setMessage(null)
    try {
      await accion()
      setMessage({ ok: true, text: exito })
      cerrar()
    } catch (error) { setMessage({ ok: false, text: error.message || 'No se pudo guardar.' }) } finally { setBusy(false) }
  }

  const guardarTitular = (evento) => {
    evento.preventDefault()
    const values = titular
    guardar(
      () => titular.id ? updateAccountHolder(titular.id, values) : createAccountHolder(values),
      titular.id ? 'Titular actualizado.' : 'Titular agregado.',
      () => { setTitular(null); getAccountHolders().then(setHolders).catch(() => {}) },
    )
  }
  const guardarEmpresa = (evento) => {
    evento.preventDefault()
    const values = empresa
    guardar(
      () => empresa.id ? updatePrivateCompany(empresa.id, values) : createPrivateCompany(values),
      empresa.id ? 'Empresa actualizada.' : 'Empresa agregada.',
      () => { setEmpresa(null); getPrivateCompanies().then(setCompanies).catch(() => {}) },
    )
  }

  return (
    <div className="space-y-4">
      {message && <Aviso tono={message.ok ? 'ok' : 'error'}>{message.text}</Aviso>}

      <Card className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="font-semibold">Empresas/personas jurídicas (privado)</h2>
            <p className="mt-1 text-sm text-mute">Nombre legal, RUC y dirección legal, separados del nombre de fantasía y la información pública de la tienda. Se usan como titular de una cuenta de cobro.</p>
          </div>
          <Button type="button" disabled={busy || !!empresa} onClick={() => setEmpresa({ ...VACIO_EMPRESA })}>Agregar empresa</Button>
        </div>
        {empresa && <form onSubmit={guardarEmpresa} className="grid gap-3 rounded-lg border border-ink-600 p-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><Label htmlFor="priv-legal-name">Nombre legal</Label><Input id="priv-legal-name" autoFocus required maxLength={200} value={empresa.legalName} onChange={(e) => setEmpresa({ ...empresa, legalName: e.target.value })} placeholder="Ej. Comercial XYZ S.A." /></div>
          <div><Label htmlFor="priv-ruc">RUC</Label><Input id="priv-ruc" maxLength={32} value={empresa.ruc} onChange={(e) => setEmpresa({ ...empresa, ruc: e.target.value })} placeholder="Ej. 80012345-6" /></div>
          <div className="sm:col-span-2"><Label htmlFor="priv-address">Dirección legal</Label><Input id="priv-address" maxLength={400} value={empresa.legalAddress} onChange={(e) => setEmpresa({ ...empresa, legalAddress: e.target.value })} placeholder="Dirección que figura en los documentos" /></div>
          <div className="sm:col-span-2"><Label htmlFor="priv-notes">Notas</Label><Textarea id="priv-notes" rows={2} maxLength={1000} value={empresa.notes} onChange={(e) => setEmpresa({ ...empresa, notes: e.target.value })} placeholder="Datos internos de la sociedad (opcional)" /></div>
          <div className="flex flex-wrap gap-2 sm:col-span-2"><Button type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar empresa'}</Button><Button type="button" variant="ghost" disabled={busy} onClick={() => setEmpresa(null)}>Cancelar</Button></div>
        </form>}
        <div className="space-y-1.5">
          {companies.length === 0 && !empresa ? <ListaVacia texto="Sin empresas registradas." /> : companies.map((row) => (
            <FilaEntidad key={row.id} titulo={row.legalName} detalle={[row.ruc, row.legalAddress].filter(Boolean).join(' · ')} activo={row.isActive} busy={busy}
              ariaEditar={`Editar ${row.legalName}`} ariaAlternar={`${row.isActive ? 'Desactivar' : 'Activar'} ${row.legalName}`}
              onEditar={() => setEmpresa({ ...VACIO_EMPRESA, ...row })}
              onAlternar={() => guardar(() => updatePrivateCompany(row.id, { isActive: !row.isActive }), row.isActive ? 'Empresa desactivada.' : 'Empresa activada.', () => getPrivateCompanies().then(setCompanies).catch(() => {}))} />
          ))}
        </div>
      </Card>

      <Card className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="font-semibold">Titulares/socios (privado)</h2>
            <p className="mt-1 text-sm text-mute">Nombres en orden (1º, 2º y 3º) con apellidos y cédula/RUC. Se eligen como titular en transferencia, Pix y USDT.</p>
          </div>
          <Button type="button" disabled={busy || !!titular} onClick={() => setTitular({ ...VACIO_TITULAR })}>Agregar titular</Button>
        </div>
        {titular && <form onSubmit={guardarTitular} className="grid gap-3 rounded-lg border border-ink-600 p-3 sm:grid-cols-3">
          <div><Label htmlFor="priv-first">Primer nombre</Label><Input id="priv-first" autoFocus required maxLength={80} value={titular.firstName} onChange={(e) => setTitular({ ...titular, firstName: e.target.value })} /></div>
          <div><Label htmlFor="priv-middle">Segundo nombre</Label><Input id="priv-middle" maxLength={80} value={titular.middleName} onChange={(e) => setTitular({ ...titular, middleName: e.target.value })} /></div>
          <div><Label htmlFor="priv-other">Tercer nombre</Label><Input id="priv-other" maxLength={80} value={titular.otherName} onChange={(e) => setTitular({ ...titular, otherName: e.target.value })} /></div>
          <div><Label htmlFor="priv-last">Primer apellido</Label><Input id="priv-last" required maxLength={80} value={titular.lastName} onChange={(e) => setTitular({ ...titular, lastName: e.target.value })} /></div>
          <div><Label htmlFor="priv-second-last">Segundo apellido</Label><Input id="priv-second-last" maxLength={80} value={titular.secondLastName} onChange={(e) => setTitular({ ...titular, secondLastName: e.target.value })} /></div>
          <div><Label htmlFor="priv-doc">Cédula/RUC</Label><Input id="priv-doc" maxLength={32} value={titular.document} onChange={(e) => setTitular({ ...titular, document: e.target.value })} placeholder="Ej. 3.456.789-0" /></div>
          <p className="text-xs text-mute sm:col-span-3">Así se va a ver: <b className="text-fore">{nombreCompleto(titular) || '—'}</b></p>
          <div className="flex flex-wrap gap-2 sm:col-span-3"><Button type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar titular'}</Button><Button type="button" variant="ghost" disabled={busy} onClick={() => setTitular(null)}>Cancelar</Button></div>
        </form>}
        <div className="space-y-1.5">
          {holders.length === 0 && !titular ? <ListaVacia texto="Sin titulares registrados." /> : holders.map((row) => (
            <FilaEntidad key={row.id} titulo={nombreCompleto(row)} detalle={row.document || ''} activo={row.isActive} busy={busy}
              ariaEditar={`Editar ${nombreCompleto(row)}`} ariaAlternar={`${row.isActive ? 'Desactivar' : 'Activar'} ${nombreCompleto(row)}`}
              onEditar={() => setTitular({ ...VACIO_TITULAR, ...row })}
              onAlternar={() => guardar(() => updateAccountHolder(row.id, { isActive: !row.isActive }), row.isActive ? 'Titular desactivado.' : 'Titular activado.', () => getAccountHolders().then(setHolders).catch(() => {}))} />
          ))}
        </div>
      </Card>
    </div>
  )
}
