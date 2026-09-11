import { useCallback, useEffect, useState } from 'react'
import { useSesion } from '@/lib/sesion'
import {
  cambiarMiClave,
  crearSucursal,
  renombrarSucursal,
  miembrosDeEmpresa,
  listInvitaciones,
  invitar,
  cancelarInvitacion,
  cambiarRol,
  quitarMiembro,
} from '@/lib/storage'
import { Card, Button, Input, Label, Badge } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import PaymentAccounts from './PaymentAccounts'

const ROLES = [
  ['dueno', 'Dueño'],
  ['encargado', 'Encargado'],
  ['vendedor', 'Vendedor'],
]
const etiquetaRol = (r) => ROLES.find(([k]) => k === r)?.[1] || r

function Aviso({ msg }) {
  if (!msg) return null
  const ok = msg.tipo === 'ok'
  return (
    <div
      className={
        'flex items-start gap-2 rounded-lg border px-3.5 py-2.5 text-sm ' +
        (ok ? 'border-ok/30 bg-ok/10 text-ok' : 'border-bad/30 bg-bad/10 text-bad')
      }
    >
      <Icon name={ok ? 'check' : 'alert'} className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{msg.txt}</span>
    </div>
  )
}

export default function Config() {
  const { sesion, empresa, sucursal, sucursales, recargarEmpresas } = useSesion()
  const esDueno = sesion?.esPropietario

  const [equipo, setEquipo] = useState([])
  const [invitados, setInvitados] = useState([])
  const [nuevaSuc, setNuevaSuc] = useState('')
  const [inv, setInv] = useState({ correo: '', nombre: '', rol: 'vendedor' })
  const [clave, setClave] = useState({ nueva: '', conf: '' })
  const [msg, setMsg] = useState(null)
  const [msgEq, setMsgEq] = useState(null)
  const [msgSuc, setMsgSuc] = useState(null)

  const recargar = useCallback(async () => {
    if (!esDueno) return
    const [m, i] = await Promise.all([miembrosDeEmpresa(), listInvitaciones()])
    setEquipo(m)
    setInvitados(i)
  }, [esDueno])

  useEffect(() => {
    recargar()
  }, [recargar])

  async function guardarClave(e) {
    e.preventDefault()
    setMsg(null)
    if (clave.nueva.length < 8)
      return setMsg({
        tipo: 'err',
        txt: 'La contraseña nueva tiene que tener al menos 8 caracteres.',
      })
    if (clave.nueva !== clave.conf)
      return setMsg({ tipo: 'err', txt: 'Las dos contraseñas no coinciden.' })
    const r = await cambiarMiClave(clave.nueva)
    if (r.error) return setMsg({ tipo: 'err', txt: r.error })
    setClave({ nueva: '', conf: '' })
    setMsg({ tipo: 'ok', txt: 'Contraseña cambiada.' })
  }

  async function agregarSucursal(e) {
    e.preventDefault()
    setMsgSuc(null)
    if (!nuevaSuc.trim()) return
    const r = await crearSucursal(nuevaSuc)
    if (r.error) return setMsgSuc({ tipo: 'err', txt: r.error })
    setNuevaSuc('')
    setMsgSuc({ tipo: 'ok', txt: `Sucursal "${r.sucursal.nombre}" creada.` })
    await recargarEmpresas()
  }

  async function renombrar(id, nombre) {
    if (!nombre.trim()) return
    await renombrarSucursal(id, nombre)
    await recargarEmpresas()
  }

  async function enviarInvitacion(e) {
    e.preventDefault()
    setMsgEq(null)
    if (!inv.correo.trim()) return setMsgEq({ tipo: 'err', txt: 'Poné el correo.' })
    const r = await invitar({ ...inv, sucursalId: sucursal?.id })
    if (r.error) return setMsgEq({ tipo: 'err', txt: r.error })
    setInv({ correo: '', nombre: '', rol: 'vendedor' })
    setMsgEq({
      tipo: 'ok',
      txt: 'Listo. Cuando cree su cuenta con ese correo, entra sola a tu tienda.',
    })
    await recargar()
  }

  return (
    <div className="space-y-4">
      {esDueno && <PaymentAccounts />}
      {/* ── Tu cuenta ──────────────────────────────────────────── */}
      <Card className="space-y-4">
        <div>
          <h2 className="font-semibold">Tu cuenta</h2>
          <p className="mt-0.5 text-sm text-mute">
            {sesion?.correo} · {etiquetaRol(sesion?.rol)} en {empresa?.nombre}
          </p>
        </div>
        <form onSubmit={guardarClave} className="max-w-md space-y-3">
          <div>
            <Label htmlFor="n1">Contraseña nueva</Label>
            <Input
              id="n1"
              type="password"
              value={clave.nueva}
              onChange={(e) => setClave((c) => ({ ...c, nueva: e.target.value }))}
              placeholder="Mínimo 8 caracteres"
              autoComplete="new-password"
            />
          </div>
          <div>
            <Label htmlFor="n2">Repetila</Label>
            <Input
              id="n2"
              type="password"
              value={clave.conf}
              onChange={(e) => setClave((c) => ({ ...c, conf: e.target.value }))}
              autoComplete="new-password"
            />
          </div>
          <Aviso msg={msg} />
          <Button type="submit">Cambiar contraseña</Button>
        </form>
      </Card>

      {esDueno && (
        <>
          {/* ── Sucursales ───────────────────────────────────────── */}
          <Card className="space-y-4">
            <div>
              <h2 className="font-semibold">Sucursales</h2>
              <p className="mt-0.5 text-sm text-mute">
                Todas comparten el catálogo y la lista de precios. El stock, las ventas y el equipo
                son de cada una.
              </p>
            </div>

            <div className="space-y-2">
              {sucursales.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center gap-2 rounded-lg border border-ink-600 p-2.5"
                >
                  <Icon name="store" className="h-4 w-4 shrink-0 text-mute" />
                  <Input
                    defaultValue={s.nombre}
                    onBlur={(e) => renombrar(s.id, e.target.value)}
                    className="h-9 md:h-9"
                  />
                  {s.id === sucursal?.id && <Badge color="blue">Activa</Badge>}
                </div>
              ))}
            </div>

            <form onSubmit={agregarSucursal} className="flex max-w-md gap-2">
              <Input
                value={nuevaSuc}
                onChange={(e) => setNuevaSuc(e.target.value)}
                placeholder="Nombre de la sucursal nueva"
                autoCapitalize="words"
              />
              <Button type="submit">Agregar</Button>
            </form>
            <Aviso msg={msgSuc} />
          </Card>

          {/* ── Equipo ───────────────────────────────────────────── */}
          <Card className="space-y-4">
            <div>
              <h2 className="font-semibold">Equipo</h2>
              <p className="mt-0.5 text-sm text-mute">
                Anotá el correo de cada vendedor. Cuando esa persona crea su cuenta con ese mismo
                correo, entra directo a tu tienda — no hace falta que le pases ninguna clave.
              </p>
            </div>

            {equipo.length > 0 && (
              <div className="overflow-hidden rounded-lg border border-ink-600">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-ink-600 bg-ink-700/40 text-left text-[11px] font-medium uppercase tracking-wider text-mute">
                      <th className="px-3.5 py-2.5">Persona</th>
                      <th className="px-3.5 py-2.5">Rol</th>
                      <th className="w-10 px-3.5 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {equipo.map((m) => {
                      const soyYo = m.user_id === sesion?.vendedorId
                      return (
                        <tr key={m.user_id} className="border-b border-ink-600/50 last:border-0">
                          <td className="px-3.5 py-2.5">
                            {m.nombre || '—'}
                            {soyYo && <span className="ml-2 text-xs text-mute">(vos)</span>}
                          </td>
                          <td className="px-3.5 py-2.5">
                            <select
                              value={m.rol}
                              disabled={soyYo}
                              onChange={async (e) => {
                                await cambiarRol(m.user_id, e.target.value)
                                recargar()
                              }}
                              className="h-8 cursor-pointer rounded-md border border-ink-500 bg-ink-800 px-2 text-xs text-white outline-none disabled:opacity-40 [&>option]:bg-ink-800"
                            >
                              {ROLES.map(([k, label]) => (
                                <option key={k} value={k}>
                                  {label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-3.5 py-2.5">
                            {!soyYo && (
                              <button
                                onClick={async () => {
                                  await quitarMiembro(m.user_id)
                                  recargar()
                                }}
                                className="text-mute transition hover:text-bad"
                                title="Quitar del equipo"
                              >
                                <Icon name="trash" className="h-4 w-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {invitados.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[11px] font-medium uppercase tracking-wider text-mute">
                  Esperando que creen su cuenta
                </div>
                {invitados.map((i) => (
                  <div
                    key={i.correo}
                    className="flex items-center gap-2 rounded-lg border border-warn/25 bg-warn/[.06] px-3 py-2 text-sm"
                  >
                    <Icon name="clock" className="h-4 w-4 shrink-0 text-warn" />
                    <span className="min-w-0 flex-1 truncate">{i.correo}</span>
                    <Badge color="slate">{etiquetaRol(i.rol)}</Badge>
                    <button
                      onClick={async () => {
                        await cancelarInvitacion(i.correo)
                        recargar()
                      }}
                      className="text-mute transition hover:text-bad"
                      title="Cancelar"
                    >
                      <Icon name="close" className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <form
              onSubmit={enviarInvitacion}
              className="grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]"
            >
              <Input
                value={inv.correo}
                onChange={(e) => setInv((x) => ({ ...x, correo: e.target.value }))}
                placeholder="correo@ejemplo.com"
                type="email"
                autoCapitalize="none"
                autoCorrect="off"
              />
              <Input
                value={inv.nombre}
                onChange={(e) => setInv((x) => ({ ...x, nombre: e.target.value }))}
                placeholder="Nombre"
                autoCapitalize="words"
              />
              <select
                value={inv.rol}
                onChange={(e) => setInv((x) => ({ ...x, rol: e.target.value }))}
                className="h-11 cursor-pointer rounded-lg border border-ink-500 bg-ink-800 px-3 text-sm text-white outline-none focus:border-fono md:h-9 [&>option]:bg-ink-800"
              >
                {ROLES.map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
              <Button type="submit">Sumar</Button>
            </form>
            <Aviso msg={msgEq} />
          </Card>
        </>
      )}
    </div>
  )
}
