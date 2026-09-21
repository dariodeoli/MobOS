import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Input } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import BancoLogo from '@/components/shared/BancoLogo'
import { normalizarBusqueda } from '@/utils/cliente'
import { cn } from '@/lib/utils'

// Buscador contextual de cuentas de cobro: en vez de un desplegable que solo
// muestra el nombre, se abre la lista completa y filtra al escribir por nombre,
// banco/procesadora, titular, número, medio o moneda. Cada resultado muestra lo
// que hace falta para elegir sin dudar: logo del banco, nombre, medio y moneda,
// titular, número parcial (enmascarado) y su estado.
// Contrato: recibe el `accountId` elegido y avisa por `onChange(id)`.
const ETIQUETA_MEDIO = { CASH: 'Efectivo', TRANSFER: 'Transferencia', CARD: 'Tarjeta / POS', TRADE_IN: 'Canje', WALLET: 'Billetera', OTHER: 'Otro' }

const numeroParcial = (numero) => {
  const limpio = String(numero || '').replace(/\s+/g, '')
  if (limpio.length <= 4) return limpio
  return `••••${limpio.slice(-4)}`
}

const campoBuscable = (account) => normalizarBusqueda([
  account.name, account.bank, account.holder, account.accountNumber,
  ETIQUETA_MEDIO[account.kind] || account.kind, account.currency,
].filter(Boolean).join(' '))

export default function CuentaCobroCombobox({ value, onChange, accounts, disabled = false, className }) {
  const [abierto, setAbierto] = useState(false)
  const [consulta, setConsulta] = useState('')
  const [resaltado, setResaltado] = useState(0)
  const listaId = useId()
  const raiz = useRef(null)
  const seleccionada = accounts.find((account) => account.id === value) || null
  // Sin elegir, el campo muestra el nombre; al escribir, la consulta manda.
  const texto = abierto ? consulta : (seleccionada?.name || '')

  useEffect(() => {
    const cerrarFuera = (event) => {
      if (event.target instanceof Node && raiz.current?.contains(event.target)) return
      setAbierto(false)
      setConsulta('')
    }
    document.addEventListener('click', cerrarFuera)
    return () => document.removeEventListener('click', cerrarFuera)
  }, [])

  const resultados = useMemo(() => {
    const termino = normalizarBusqueda(consulta)
    const activas = accounts.filter((account) => account.isActive && ['USD', 'PYG', 'BRL'].includes(account.currency))
    if (!termino) return activas
    return activas.filter((account) => campoBuscable(account).includes(termino))
  }, [accounts, consulta])

  function elegir(account) {
    onChange(account.id)
    setAbierto(false)
    setConsulta('')
    setResaltado(0)
  }

  function alTeclear(event) {
    if (event.key === 'Escape') { setAbierto(false); setConsulta(''); return }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!abierto) { setAbierto(true); return }
      if (!resultados.length) return
      const paso = event.key === 'ArrowDown' ? 1 : -1
      setResaltado((actual) => (actual + paso + resultados.length) % resultados.length)
      return
    }
    if (event.key === 'Enter' && abierto && resultados[resaltado]) {
      event.preventDefault()
      elegir(resultados[resaltado])
    }
  }

  return (
    <div ref={raiz} className={cn('relative', className)}>
      <Input
        aria-label="Cuenta de cobro"
        role="combobox"
        aria-expanded={abierto}
        aria-controls={listaId}
        aria-autocomplete="list"
        autoComplete="off"
        disabled={disabled}
        placeholder={
          seleccionada
            ? seleccionada.name
            : accounts.length ? 'Buscar cuenta: nombre, banco, titular o número…' : 'Sin cuentas cargadas'
        }
        value={texto}
        onFocus={() => { setAbierto(true); setConsulta(''); setResaltado(0) }}
        onBlur={() => setTimeout(() => { setAbierto(false); setConsulta('') }, 120)}
        onChange={(event) => { setConsulta(event.target.value); setAbierto(true); setResaltado(0) }}
        onKeyDown={alTeclear}
      />
      {abierto && (
        <ul id={listaId} role="listbox" aria-label="Cuentas de cobro" className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-ink-500 bg-ink-800 py-1 shadow-xl">
          {resultados.map((account, indice) => (
            <li key={account.id}>
              <button
                type="button"
                role="option"
                aria-selected={account.id === value}
                tabIndex={-1}
                className={cn('flex w-full items-start gap-2.5 px-3 py-2 text-left text-sm transition', indice === resaltado ? 'bg-ink-700' : '')}
                onMouseDown={(event) => { event.preventDefault(); elegir(account) }}
                onMouseEnter={() => setResaltado(indice)}
              >
                {account.bank ? <BancoLogo banco={account.bank} alto="h-4" /> : <Icon name="wallet" className="mt-0.5 h-4 w-4 shrink-0 text-fono-light" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-fore">{account.name}</span>
                  <span className="block truncate text-xs text-mute">
                    {[account.bank, account.holder].filter(Boolean).join(' · ') || ETIQUETA_MEDIO[account.kind] || account.kind}
                    {account.accountNumber ? ` · ${numeroParcial(account.accountNumber)}` : ''}
                  </span>
                </span>
                <span className="shrink-0 rounded border border-ink-500 px-1.5 py-0.5 text-[10px] font-bold text-mute">{account.currency}</span>
              </button>
            </li>
          ))}
          {!resultados.length && (
            <li className="px-3 py-2 text-sm text-mute">No hay cuentas activas que coincidan.</li>
          )}
        </ul>
      )}
    </div>
  )
}
