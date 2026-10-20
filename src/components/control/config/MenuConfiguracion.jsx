import { useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import Icon from '@/components/shared/Icon'
import { buscarAjustes, migasAjuste } from '@/lib/configIndice'
import { CELDA_DATO, CELDA_IDENTIDAD } from '@/components/shared/tabla'
import { grupoConfig } from './gruposConfig'

// #410 · Menú de Configuración (segunda columna del shell en escritorio):
// «‹ Configuración» para volver, buscador de ajustes (el mismo índice que la
// búsqueda global), bloque de la empresa y las secciones con ícono. Solo
// presenta: qué secciones existen y a cuáles entra el rol lo decide el
// catálogo que recibe `items`.

function ItemSeccion({ id, label, activo, onChange }) {
  const icono = grupoConfig(id)?.icono || 'settings'
  return (
    <button
      type="button"
      data-tab-id={id}
      aria-label={label}
      aria-current={activo ? 'page' : undefined}
      onClick={() => onChange(id)}
      className={cn(
        'flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-sm transition hover:bg-ink-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-fono',
        activo ? 'bg-ink-700 font-semibold text-fore' : 'text-mute hover:text-fore',
      )}
    >
      <Icon name={icono} className={cn('h-4 w-4 shrink-0', activo && 'text-fono-light')} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  )
}

export default function MenuConfiguracion({ items = [], value, onChange, onModules, modulesActive = false, onBack, onElegirAjuste, empresa, logo, esOwner = true }) {
  const [consulta, setConsulta] = useState('')
  const resultadosRef = useRef(null)
  const resultados = useMemo(() => buscarAjustes(consulta, { esOwner, limite: 6 }), [consulta, esOwner])
  const buscando = consulta.trim().length > 0
  const nombre = empresa?.nombre || 'Tu empresa'

  function elegir(entrada) {
    setConsulta('')
    onElegirAjuste?.(entrada)
  }

  function alTeclear(event) {
    if (event.key === 'Escape' && consulta) {
      event.preventDefault()
      event.stopPropagation()
      setConsulta('')
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      resultadosRef.current?.querySelector('button')?.focus()
    } else if (event.key === 'Enter' && resultados[0]) {
      event.preventDefault()
      elegir(resultados[0])
    }
  }

  function alTeclearResultado(event) {
    const botones = [...(resultadosRef.current?.querySelectorAll('button') || [])]
    const indice = botones.indexOf(event.currentTarget)
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      botones[Math.min(indice + 1, botones.length - 1)]?.focus()
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (indice === 0) event.currentTarget.closest('[data-config-menu]')?.querySelector('input')?.focus()
      else botones[indice - 1]?.focus()
    }
  }

  return (
    <div data-config-menu className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2">
      <button
        type="button"
        data-testid="config-volver"
        aria-label="Volver desde Configuración"
        onClick={onBack}
        className="flex min-h-11 items-center gap-1.5 rounded-lg px-1.5 text-left font-semibold text-fore hover:bg-ink-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-fono"
      >
        <Icon name="back" className="h-4 w-4 shrink-0 text-mute" />
        <span className="text-base">Configuración</span>
      </button>

      <div className="relative">
        <Icon name="search" className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-mute" />
        <input
          type="search"
          data-testid="config-buscar"
          aria-label="Buscar ajustes"
          placeholder="Buscar ajustes"
          value={consulta}
          onChange={event => setConsulta(event.target.value)}
          onKeyDown={alTeclear}
          className="h-10 w-full rounded-lg border border-ink-600 bg-ink pl-8 pr-2 text-sm text-fore placeholder:text-mute focus-visible:outline focus-visible:outline-2 focus-visible:outline-fono"
        />
      </div>

      {buscando ? (
        <div ref={resultadosRef} data-testid="config-buscar-resultados" role="group" aria-label="Ajustes encontrados" className="flex flex-col gap-0.5">
          {resultados.length === 0 && <p role="status" className="px-2.5 py-2 text-sm text-mute">Sin coincidencias.</p>}
          {resultados.map(entrada => (
            <button
              key={entrada.id}
              type="button"
              data-ajuste-id={entrada.id}
              onClick={() => elegir(entrada)}
              onKeyDown={alTeclearResultado}
              className="flex min-h-11 w-full flex-col justify-center rounded-lg px-2.5 text-left hover:bg-ink-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-fono"
            >
              <span className="truncate text-sm font-medium text-fore">{entrada.label}</span>
              <span className={cn('block', CELDA_DATO)}>{migasAjuste(entrada).slice(1).join(' › ')}</span>
            </button>
          ))}
        </div>
      ) : (
        <>
          <div data-testid="config-empresa" className="flex items-center gap-2.5 rounded-lg border border-ink-600 px-2.5 py-2">
            {logo ? (
              <img src={logo} alt="" className="h-8 w-8 shrink-0 rounded-md object-contain" />
            ) : (
              <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-ink-700 text-sm font-semibold text-fore">
                {nombre.trim().charAt(0).toUpperCase()}
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className={cn('block leading-4 text-fore', CELDA_IDENTIDAD)}>{nombre}</span>
              <span className={cn('block leading-4', CELDA_DATO)}>Tu empresa</span>
            </span>
          </div>
          <button
            type="button"
            data-testid="config-tienda-modulos"
            aria-label="Tienda de módulos"
            aria-current={modulesActive ? 'page' : undefined}
            onClick={() => (onModules || onChange)('modulos')}
            className={cn(
              'flex min-h-12 w-full items-center gap-2.5 rounded-lg border px-2.5 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-fono',
              modulesActive ? 'border-fono/50 bg-fono/10 text-fore' : 'border-fono/30 bg-fono/5 text-fore hover:border-fono/50 hover:bg-fono/10',
            )}
          >
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-fono/15 text-fono-light"><Icon name="grid" className="h-4 w-4" /></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">Tienda de módulos</span>
              <span className="block truncate text-xs text-mute">Activá funciones para tu empresa</span>
            </span>
            <Icon name="chevron" className="h-4 w-4 shrink-0 -rotate-90 text-mute" />
          </button>
          <nav aria-label="Secciones de Configuración" data-testid="config-grupos" data-menu-lateral className="flex flex-col gap-0.5">
            {items.map(([id, label]) => (
              <ItemSeccion key={id} id={id} label={label} activo={value === id} onChange={onChange} />
            ))}
          </nav>
        </>
      )}
    </div>
  )
}
