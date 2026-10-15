import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Aviso, Button, Input, Label, Select, Textarea, useToast } from '@/components/ui'
import { fechaHora, formatNumero, soloFecha } from '@/lib/superadmin/formato'
import ListaPlataforma, { Datos } from './ListaPlataforma'

// Verificaciones IMEI por empresa (docs/IMEI-CREDITOS.md). Solo el dueño de la
// plataforma las gestiona; las empresas ven únicamente «Te quedan N».
const RUTA = '/api/superadmin/imei-creditos'
const usd = n => `US$ ${Number(n || 0).toFixed(2)}`
const SOLO_DIGITOS = valor => valor.replace(/\D/g, '').slice(0, 6)

const COLUMNAS = [
  { clave: 'name', titulo: 'Empresa', render: f => f.name, ancho: 'w-[30%]' },
  { clave: 'saldo', titulo: 'Saldo', render: f => formatNumero(f.saldo), ancho: 'w-[10%]' },
  { clave: 'cupo', titulo: 'Cupo mensual', render: f => (f.cupoMensual ? formatNumero(f.cupoMensual) : '—'), ancho: 'w-[12%]' },
  { clave: 'consumidas', titulo: 'Consumidas', render: f => formatNumero(f.consumidos), ancho: 'w-[12%]' },
  { clave: 'consultas', titulo: 'Consultas', render: f => formatNumero(f.consultas), ancho: 'w-[10%]' },
  { clave: 'costo', titulo: 'Costo proveedor', render: f => usd(f.costoUsd), ancho: 'w-[14%]' },
]

const TIPO = { GRANT: 'Alta', CONSUME: 'Consumo', REFUND: 'Devolución', EXPIRE: 'Vencimiento', ADJUST: 'Ajuste' }
const ORIGEN = { FREE: 'Bienvenida', GRANT: 'Agregadas', MONTHLY: 'Cupo mensual', ADJUST: 'Ajuste' }

function Accion({ titulo, children, onSubmit, ocupado, testId, etiquetaBoton }) {
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2 rounded-xl border border-ink-600 p-3" data-testid={testId}>
      <h4 className="text-sm font-semibold text-fore">{titulo}</h4>
      {children}
      <Button type="submit" disabled={ocupado} className="self-start">{ocupado ? 'Guardando…' : etiquetaBoton}</Button>
    </form>
  )
}

function DetalleCreditos({ id }) {
  const toast = useToast()
  const [estado, setEstado] = useState({ cargando: true, datos: null, error: '' })
  const [ocupado, setOcupado] = useState('')
  const [error, setError] = useState('')
  const [agregar, setAgregar] = useState({ cantidad: '', venceEl: '', nota: '' })
  const [cupo, setCupo] = useState('')
  const [ajuste, setAjuste] = useState({ signo: '+', cantidad: '', nota: '' })

  const cargar = useCallback(() => {
    return api.get(`${RUTA}/${encodeURIComponent(id)}`, { cacheMs: 0 })
      .then(datos => { setEstado({ cargando: false, datos, error: '' }); setCupo(String(datos.cupoMensual || '')) })
      .catch(err => { console.error('[superadmin] créditos:', err); setEstado({ cargando: false, datos: null, error: 'No se pudo cargar el detalle.' }) })
  }, [id])
  useEffect(() => { cargar() }, [cargar])

  async function enviar(clave, cuerpo, exito) {
    setOcupado(clave); setError('')
    try {
      await api.post(`${RUTA}/${encodeURIComponent(id)}`, { ...cuerpo, opId: globalThis.crypto?.randomUUID?.() })
      toast.success(exito)
      await cargar()
    } catch (err) {
      console.error('[superadmin] acción de créditos:', err)
      setError(err?.message || 'No se pudo guardar.')
    } finally { setOcupado('') }
  }

  const { cargando, datos } = estado
  if (cargando) return <p className="text-sm text-mute" role="status">Cargando…</p>
  if (estado.error || !datos) return <p role="alert" className="text-sm text-bad-text">{estado.error || 'No se encontró la empresa.'}</p>

  return (
    <div className="flex flex-col gap-4" data-testid="detalle-creditos-imei">
      <Datos filas={[
        ['Saldo vigente', `${formatNumero(datos.saldo)} verificaciones`],
        ['Cupo mensual', datos.cupoMensual ? `${formatNumero(datos.cupoMensual)} por mes` : 'Sin cupo'],
        ['Consultas al proveedor', formatNumero(datos.costoProveedorUsd.consultas)],
        ['Costo del proveedor (total)', usd(datos.costoProveedorUsd.total)],
        ['Costo del proveedor (mes actual)', usd(datos.costoProveedorUsd.mesActual)],
        ['Control de saldo', datos.enforce ? 'Activo (bloquea sin saldo)' : 'En sombra (solo registra)'],
      ]} />

      {error && <Aviso tono="error">{error}</Aviso>}
      <div className="grid gap-3 md:grid-cols-3">
        <Accion titulo="Agregar verificaciones" testId="creditos-agregar" ocupado={ocupado === 'agregar'} etiquetaBoton="Agregar"
          onSubmit={e => { e.preventDefault(); enviar('agregar', { action: 'agregar', cantidad: Number(agregar.cantidad), venceEl: agregar.venceEl || undefined, nota: agregar.nota }, 'Verificaciones agregadas.').then(() => setAgregar({ cantidad: '', venceEl: '', nota: '' })) }}>
          <div><Label htmlFor="cr-cantidad">Cantidad</Label><Input id="cr-cantidad" inputMode="numeric" required value={agregar.cantidad} onChange={e => setAgregar(a => ({ ...a, cantidad: SOLO_DIGITOS(e.target.value) }))} className="w-32" /></div>
          <div><Label htmlFor="cr-vence">Vence (opcional)</Label><Input id="cr-vence" type="date" value={agregar.venceEl} onChange={e => setAgregar(a => ({ ...a, venceEl: e.target.value }))} className="w-44" /></div>
          <div><Label htmlFor="cr-nota">Nota</Label><Input id="cr-nota" maxLength={300} value={agregar.nota} onChange={e => setAgregar(a => ({ ...a, nota: e.target.value }))} /></div>
        </Accion>
        <Accion titulo="Cupo mensual" testId="creditos-cupo" ocupado={ocupado === 'cupo'} etiquetaBoton="Guardar cupo"
          onSubmit={e => { e.preventDefault(); enviar('cupo', { action: 'cupo', cantidad: Number(cupo || 0) }, 'Cupo mensual guardado.') }}>
          <div><Label htmlFor="cr-cupo">Verificaciones por mes</Label><Input id="cr-cupo" inputMode="numeric" value={cupo} onChange={e => setCupo(SOLO_DIGITOS(e.target.value))} className="w-32" /></div>
          <p className="text-xs text-mute">Se acredita el día 1 de cada mes. Lo no usado se arrastra hasta 3 meses de cupo; cada lote vence a los 12 meses.</p>
        </Accion>
        <Accion titulo="Ajuste" testId="creditos-ajuste" ocupado={ocupado === 'ajuste'} etiquetaBoton="Aplicar ajuste"
          onSubmit={e => { e.preventDefault(); enviar('ajuste', { action: 'ajuste', cantidad: Number(ajuste.cantidad) * (ajuste.signo === '-' ? -1 : 1), nota: ajuste.nota }, 'Ajuste aplicado.').then(() => setAjuste({ signo: '+', cantidad: '', nota: '' })) }}>
          <div className="flex gap-2">
            <div><Label htmlFor="cr-signo">Tipo</Label><Select id="cr-signo" value={ajuste.signo} onChange={e => setAjuste(a => ({ ...a, signo: e.target.value }))}><option value="+">Sumar</option><option value="-">Restar</option></Select></div>
            <div><Label htmlFor="cr-aj-cantidad">Cantidad</Label><Input id="cr-aj-cantidad" inputMode="numeric" required value={ajuste.cantidad} onChange={e => setAjuste(a => ({ ...a, cantidad: SOLO_DIGITOS(e.target.value) }))} className="w-28" /></div>
          </div>
          <div><Label htmlFor="cr-aj-nota">Nota (obligatoria)</Label><Textarea id="cr-aj-nota" required rows={2} maxLength={300} value={ajuste.nota} onChange={e => setAjuste(a => ({ ...a, nota: e.target.value }))} /></div>
        </Accion>
      </div>

      <section aria-label="Lotes">
        <h3 className="mb-2 text-sm font-semibold text-fore">Lotes</h3>
        {datos.lotes.length === 0 ? <p className="text-sm text-mute">Sin lotes.</p> : (
          <ul className="divide-y divide-ink-600 rounded-xl border border-ink-600">
            {datos.lotes.map(l => (
              <li key={l.id} className="flex flex-wrap items-baseline justify-between gap-x-3 px-3 py-2 text-sm">
                <span className="font-medium text-fore">{ORIGEN[l.source] || l.source} · {formatNumero(l.remaining)} de {formatNumero(l.granted)}</span>
                <span className="text-xs text-mute">{l.expiresAt ? `vence ${soloFecha(l.expiresAt)}` : 'no vence'}{l.note ? ` · ${l.note}` : ''}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Consumo por servicio">
        <h3 className="mb-2 text-sm font-semibold text-fore">Consumo por servicio</h3>
        {datos.consumo.length === 0 ? <p className="text-sm text-mute">Todavía no consumió verificaciones.</p> : (
          <ul className="divide-y divide-ink-600 rounded-xl border border-ink-600">
            {datos.consumo.map(c => (
              <li key={c.servicio} className="flex justify-between gap-3 px-3 py-2 text-sm"><span className="text-fore">{c.servicio}</span><span className="text-mute">{formatNumero(c.creditos)} verificaciones · {formatNumero(c.consultas)} consultas</span></li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Historial">
        <h3 className="mb-2 text-sm font-semibold text-fore">Historial</h3>
        {datos.movimientos.length === 0 ? <p className="text-sm text-mute">Sin movimientos.</p> : (
          <ul className="max-h-72 divide-y divide-ink-600 overflow-y-auto rounded-xl border border-ink-600" data-testid="creditos-historial">
            {datos.movimientos.map(m => (
              <li key={m.id} className="flex flex-wrap items-baseline justify-between gap-x-3 px-3 py-2 text-sm">
                <span className="text-fore">{TIPO[m.type] || m.type} <b className={m.amount < 0 ? 'text-bad-text' : 'text-ok'}>{m.amount > 0 ? '+' : ''}{m.amount}</b>{m.serviceKey ? ` · ${m.serviceKey}` : ''}{m.note ? ` · ${m.note}` : ''}</span>
                <span className="text-xs text-mute">{fechaHora(m.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

export default function CreditosImei() {
  return (
    <ListaPlataforma
      nombre="creditos-imei" ruta={RUTA} columnas={COLUMNAS} placeholder="Buscar por nombre, correo o identificador"
      detalleTitulo="Verificaciones IMEI de la empresa" DetalleContenido={DetalleCreditos} ordenInicial="consumo"
      filtros={[]}
      ordenes={[['consumo', 'Consumo'], ['saldo', 'Saldo'], ['costo', 'Costo proveedor'], ['nombre', 'Nombre']]}
    />
  )
}
