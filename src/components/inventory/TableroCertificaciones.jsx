// #240: tablero de certificaciones PhoneCheck con filtros y export CSV.
// Calcula grados, certificadas y pendientes desde las unidades cargadas.
import { useMemo, useState } from 'react'
import { Badge, Button, Card, EmptyState, Select } from '@/components/ui'
import { ROTULO_SECCION } from '@/components/shared/tabla'
import { colorBadge, gradoCondicion } from '@/lib/estadoEquipo'
import { resumenCertificaciones } from '@/lib/phonecheck'
import { descargarArchivo } from '@/utils/descargarArchivo'

export default function TableroCertificaciones({ units = [], onAbrirUnidad }) {
  const [grado, setGrado] = useState('todos')
  const [soloPendientes, setSoloPendientes] = useState(false)
  const resumen = useMemo(() => resumenCertificaciones(units), [units])
  const filas = useMemo(() => units
    .filter(unit => {
      const valor = unit.inspection?.grado || null
      if (grado !== 'todos' && valor !== grado) return false
      if (soloPendientes && valor) return false
      return true
    })
    .map(unit => ({
      id: unit.id,
      serial: unit.serial || '',
      producto: unit.product?.name || '',
      grado: unit.inspection?.grado || '',
      puntaje: unit.inspection?.puntaje ?? '',
      verificado: unit.lastVerifiedAt || unit.inspection?.inspeccionadoAt || '',
      por: unit.inspection?.inspeccionadoPor || '',
    })), [units, grado, soloPendientes])

  function exportar() {
    const encabezado = ['Serial', 'Producto', 'Grado', 'Puntaje', 'Verificado', 'Por']
    const csv = [encabezado, ...filas.map(fila => [fila.serial, fila.producto, fila.grado, fila.puntaje, fila.verificado, fila.por])]
      .map(linea => linea.map(valor => `"${String(valor ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n')
    descargarArchivo('certificaciones-phonecheck.csv', csv, { tipo: 'text/csv;charset=utf-8', bom: true })
  }

  const tarjetas = [
    { clave: 'A', valor: resumen.A }, { clave: 'B', valor: resumen.B }, { clave: 'C', valor: resumen.C },
  ]
  return <Card className="p-4" data-testid="certificaciones-tablero">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h3 className={ROTULO_SECCION}>Certificaciones PhoneCheck</h3>
        <p className="mt-1 text-xs text-mute">Grado calculado por el checklist: A ≥ 90, B ≥ 75, C el resto. {resumen.certificadas} de {resumen.total} certificadas · {resumen.pendientes} pendientes · {resumen.sinVerificacion} sin verificar.</p>
      </div>
      <span className="flex flex-wrap items-center gap-2">
        <Select aria-label="Filtrar por grado" value={grado} onChange={event => setGrado(event.target.value)} className="w-auto"><option value="todos">Todos los grados</option><option value="A">Grado A</option><option value="B">Grado B</option><option value="C">Grado C</option></Select>
        <Button type="button" variant={soloPendientes ? 'default' : 'outline'} className="px-2 text-xs" onClick={() => setSoloPendientes(actual => !actual)}>Solo pendientes</Button>
        <Button type="button" variant="outline" className="px-2 text-xs" disabled={!filas.length} onClick={exportar}>Exportar CSV</Button>
      </span>
    </div>
    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
      {tarjetas.map(tarjeta => { const meta = gradoCondicion(tarjeta.clave); return <div key={tarjeta.clave} className="rounded-lg border border-ink-600 p-2 text-center"><p className={ROTULO_SECCION}>{meta?.etiqueta || `Grado ${tarjeta.clave}`}</p><p className={`text-lg font-bold ${tarjeta.clave === 'A' ? 'text-ok' : tarjeta.clave === 'B' ? 'text-warn' : 'text-bad'}`}>{tarjeta.valor}</p></div> })}
      <div className="rounded-lg border border-ink-600 p-2 text-center"><p className={ROTULO_SECCION}>Pendientes</p><p className="text-lg font-bold text-fore">{resumen.pendientes}</p></div>
      <div className="rounded-lg border border-ink-600 p-2 text-center"><p className={ROTULO_SECCION}>Sin verificar</p><p className="text-lg font-bold text-fore">{resumen.sinVerificacion}</p></div>
    </div>
    <div className="mt-3 space-y-1">
      {filas.slice(0, 12).map(fila => <button key={fila.id} type="button" onClick={() => onAbrirUnidad?.(fila.id)} className="flex w-full items-center justify-between gap-2 rounded-lg border border-ink-600 px-2 py-1 text-left text-xs transition hover:border-fono/40">
        <span className="min-w-0 truncate text-fore">{fila.producto || 'Equipo'} · {fila.serial}</span>
        <span className="flex shrink-0 items-center gap-2">{fila.grado ? <Badge color={colorBadge(gradoCondicion(fila.grado)?.tono)}>{`Grado ${fila.grado}`}</Badge> : <Badge color="slate">Pendiente</Badge>}{fila.puntaje !== '' && <span className="tabular-nums text-mute">{fila.puntaje}/100</span>}</span>
      </button>)}
      {!filas.length && <EmptyState compact icon="check" title="Sin unidades para este filtro." />}
    </div>
  </Card>
}
