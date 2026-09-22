import { FilaDato } from '@/components/ui'
import ChipEstado from '@/components/shared/ChipEstado'
import ChipsLocks from '@/components/shared/ChipsLocks'
import CodigoQr from '@/components/shared/CodigoQr'
import GradoBadge from '@/components/shared/GradoBadge'
import MedidorBateria from '@/components/shared/MedidorBateria'
import { cn } from '@/lib/utils'

// Ficha de certificado del informe público (#240): la tarjeta del informe de
// dispositivo (modelo, IMEI enmascarado, grado, batería, checklist, locks y
// quién/cuándo verificó) con el QR al informe. Portable: todo entra por props y
// las acciones las pone la pantalla; sirve igual en la página pública y en la
// vista previa del informe.
export default function FichaCertificado({
  empresa,
  modelo,
  imei,
  grado,
  bateria,
  ciclos,
  locks = [],
  aprobados,
  total,
  verificadoPor,
  verificadoAt,
  enlace,
  etiquetaQr = 'Escaneá para ver el informe completo',
  acciones,
  className,
}) {
  const hayChecklist = Number(total) > 0
  const completo = hayChecklist && Number(aprobados) === Number(total)
  return (
    <article className={cn('overflow-hidden rounded-2xl border border-ink-600 bg-ink-800', className)}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-600 p-4">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wider text-mute">{empresa || 'Informe de dispositivo'}</p>
          <h2 className="truncate text-lg font-bold">{modelo || 'Equipo'}</h2>
        </div>
        <ChipEstado estado="pass" />
      </header>

      <div className="grid gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0 space-y-3">
          <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
            <FilaDato etiqueta="IMEI / serial" valor={imei || '—'} valorClassName="font-mono text-xs" />
            <FilaDato etiqueta="Grado" valor={grado ? <GradoBadge grado={grado} /> : 'Sin grado asignado'} />
            <FilaDato etiqueta="Batería" valor={<MedidorBateria porcentaje={bateria} ciclos={ciclos} variante="barra" compact />} className="items-end" />
            <FilaDato
              etiqueta="Checklist"
              valor={hayChecklist
                ? <span className={completo ? 'text-pass' : 'text-mute'}>{aprobados} de {total} pass</span>
                : 'Sin verificación física'}
            />
          </dl>
          {locks.length ? <ChipsLocks locks={locks} conEstado /> : null}
          <p className="text-xs text-mute">
            {verificadoPor ? `Verificado por ${verificadoPor}` : 'Verificación pendiente'}{verificadoAt ? ` · ${verificadoAt}` : ''}
          </p>
        </div>

        {enlace ? (
          <div className="flex flex-col items-center gap-2">
            <CodigoQr valor={enlace} ancho={180} alt="QR del informe del dispositivo" />
            <p className="max-w-[12rem] break-all text-center text-[11px] text-mute">{etiquetaQr}</p>
          </div>
        ) : null}
      </div>

      {acciones ? <footer className="flex flex-wrap gap-2 border-t border-ink-600 p-4">{acciones}</footer> : null}
    </article>
  )
}
