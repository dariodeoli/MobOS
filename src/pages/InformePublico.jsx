// #240: página pública del informe PhoneCheck (/u/<serial>): grado, batería,
// locks, aviso de blacklist y quién/cuándo verificó + QR. Sin sesión ni PII.
// Etiquetas y tonos salen de los objetos compartidos (estadoEquipo/tabla/ui).
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import QRCode from 'qrcode'
import { API_URL } from '@/lib/api/client'
import { Badge, Button, Card, Nota, Skeleton } from '@/components/ui'
import { ROTULO_SECCION } from '@/components/shared/tabla'
import { colorBadge, estadoItem, estadoLock, gradoCondicion, tonoBateria } from '@/lib/estadoEquipo'

const ESTADO_MAPA = { ok: 'ok', observacion: 'aviso', aviso: 'aviso', falla: 'falla', na: 'sinVerificar', sinVerificar: 'sinVerificar' }

export default function InformePublico() {
  const { serial } = useParams()
  const [informe, setInforme] = useState(null)
  const [error, setError] = useState('')
  const [qr, setQr] = useState('')
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    let vigente = true
    setCargando(true)
    fetch(`${API_URL}/api/public/informe/${encodeURIComponent(serial || '')}`, { headers: { Accept: 'application/json' } })
      .then(async respuesta => { const datos = await respuesta.json().catch(() => null); if (!respuesta.ok) throw new Error(datos?.message || 'No se pudo cargar el certificado.'); return datos })
      .then(datos => { if (vigente) setInforme(datos) })
      .catch(causa => { if (vigente) setError(causa.message || 'No se pudo cargar el certificado.') })
      .finally(() => { if (vigente) setCargando(false) })
    return () => { vigente = false }
  }, [serial])

  useEffect(() => {
    if (!informe) return
    QRCode.toDataURL(window.location.href, { width: 512, margin: 1 }).then(setQr).catch(() => setQr(''))
  }, [informe])

  if (cargando) return <div className="mx-auto max-w-xl p-6"><Skeleton className="h-40 w-full" /></div>
  if (error) return <div className="mx-auto max-w-xl p-6"><Nota tono="error">{error}</Nota><p className="mt-3 text-xs text-mute">Pedí el enlace actualizado al comercio donde se hizo la inspección.</p></div>

  const grado = gradoCondicion(informe.grado)
  const bateria = informe.bateria?.porcentaje
  const tonoBat = tonoBateria(bateria)
  return <div className="mx-auto max-w-xl space-y-4 p-4 sm:p-6">
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className={ROTULO_SECCION}>Certificado PhoneCheck</p>
          <h1 className="mt-1 text-lg font-bold text-fore">{informe.producto || 'Equipo'}{informe.capacidad ? ` · ${informe.capacidad}` : ''}</h1>
          <p className="mt-1 text-xs text-mute">Serial {informe.serial}</p>
        </div>
        <div className="text-right">
          {grado ? <Badge color={colorBadge(grado.tono)}>{grado.etiqueta}</Badge> : <Badge color="slate">Sin certificar</Badge>}
          {informe.puntaje !== null && <p className="mt-1 text-sm font-semibold tabular-nums text-fore">{informe.puntaje}/100</p>}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
        <div className="rounded-lg border border-ink-600 p-2"><p className={ROTULO_SECCION}>Batería</p><p className={`font-semibold text-${tonoBat === 'ok' ? 'ok' : tonoBat === 'warn' ? 'warn' : tonoBat === 'bad' ? 'bad' : 'fore'}`}>{bateria ? `${bateria}%` : '—'}{informe.bateria?.ciclos ? ` · ${informe.bateria.ciclos} ciclos` : ''}</p></div>
        <div className="rounded-lg border border-ink-600 p-2"><p className={ROTULO_SECCION}>Cosmético</p><p className="font-semibold text-fore">{informe.cosmetico || '—'}{informe.repuestosNoOem ? ` · Repuestos: ${informe.repuestosNoOem}${informe.repuestosNoOemNota ? ` (${informe.repuestosNoOemNota})` : ''}` : ''}</p></div>
        <div className="rounded-lg border border-ink-600 p-2"><p className={ROTULO_SECCION}>Verificado</p><p className="font-semibold text-fore">{informe.verificado ? new Date(informe.verificado).toLocaleDateString('es-PY') : '—'}{informe.verificadoPor ? ` · ${informe.verificadoPor}` : ''}</p></div>
      </div>
      {informe.controles?.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{informe.controles.map(control => { const estado = estadoLock(control.ok ? 'libre' : 'activo'); return <span key={control.label} className={`rounded-lg border px-2 py-1 text-[10px] font-semibold border-${estado.tono === 'ok' ? 'ok' : 'bad'}/40 text-${estado.tono === 'ok' ? 'ok' : 'bad'}`}>{control.label}: {estado.etiqueta}</span> })}</div>}
      <Nota tono="warn" className="mt-3">{informe.aviso}</Nota>
    </Card>
    {informe.items?.length > 0 && <Card className="p-5"><h2 className={ROTULO_SECCION}>Checklist de inspección</h2><div className="mt-2 space-y-1.5">{informe.items.map(item => { const estado = estadoItem(ESTADO_MAPA[item.estado] || 'sinVerificar'); return <p key={item.label} className="text-sm"><span className={`mr-1.5 inline-block h-2 w-2 rounded-full bg-${estado.tono === 'ok' ? 'ok' : estado.tono === 'warn' ? 'warn' : estado.tono === 'bad' ? 'bad' : 'mute'}`} /><b className="text-fore">{item.label}:</b> <span className="text-mute">{estado.etiqueta}{item.nota ? ` — ${item.nota}` : ''}</span></p> })}</div></Card>}
    <Card className="flex flex-col items-center gap-3 p-5">{qr ? <img src={qr} alt="QR del informe" className="h-40 w-40 rounded-xl bg-white p-2" /> : null}<p className="text-center text-xs text-mute">Escaneá el QR para abrir este certificado. El serial va enmascarado y no incluye datos del cliente.</p><Button type="button" variant="outline" onClick={() => window.print()}>Imprimir</Button></Card>
  </div>
}
