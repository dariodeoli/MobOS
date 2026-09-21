import { useState } from 'react'
import { cn } from '@/lib/utils'
import { colorDeBanco, inicialesDeBanco, logoDeBanco } from '@/lib/bancosLogos'
import { MARCAS_MEDIO_PAGO, marcaDeMedio } from '@/components/shared/MedioPago'

// Logo de un banco (#119): asset del repo, marca vectorial compartida o
// monograma con iniciales + color. Nunca deja un cuadro roto: si el archivo no
// carga, cae al monograma. Todo el mapeo vive en src/lib/bancosLogos.js.
// `soloCatalogo`: en listados, no inventar monograma para nombres escritos a
// mano (solo bancos del catálogo o marcas conocidas).
export default function BancoLogo({ banco, alto = 'h-5', className, soloCatalogo = false }) {
  const [fallo, setFallo] = useState(false)
  const texto = String(banco || '').trim()
  const registro = logoDeBanco(texto)
  if (!registro) return null

  // La marca de MedioPago se prueba solo cuando el nombre no está en el
  // catálogo: el registro es la fuente y evita confusiones (p. ej. Banco Itaú
  // no debe caer en el logo de PIK ITAÚ).
  const marca = registro.tipo === 'marca' ? registro.marca : registro.generico ? marcaDeMedio(texto) : null
  if (marca && MARCAS_MEDIO_PAGO[marca]) {
    const Logo = MARCAS_MEDIO_PAGO[marca]
    return (
      <span className={cn('inline-flex items-center', alto, className)} title={texto}>
        <Logo />
      </span>
    )
  }

  if (soloCatalogo && registro.generico) return null

  if (registro.tipo === 'archivo' && !fallo) {
    return (
      <span className={cn('inline-flex items-center', alto, className)} title={texto}>
        <img
          src={`/bancos/${registro.archivo}`}
          alt=""
          loading="lazy"
          onError={() => setFallo(true)}
          className={cn('h-full w-auto max-w-[6rem] object-contain', registro.chip && 'rounded-[4px] bg-white px-1 py-[1px]')}
        />
      </span>
    )
  }

  // Si el asset no carga, monograma con las iniciales del banco.
  const iniciales = registro.iniciales || inicialesDeBanco(texto)
  const color = registro.color || colorDeBanco(texto)
  return (
    <span className={cn('inline-flex items-center', alto, className)} title={texto}>
      <span
        aria-hidden="true"
        className="grid h-full min-w-[1.15rem] place-items-center rounded-[5px] px-1 text-[9px] font-bold leading-none tracking-tight text-white"
        style={{ backgroundColor: color }}
      >
        {iniciales}
      </span>
    </span>
  )
}
