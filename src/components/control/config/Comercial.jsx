import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSesion } from '@/lib/sesion'
import { api } from '@/lib/api/client'
import Switch from '@/components/shared/Switch'
import PercentField from '@/components/shared/PercentField'
import { Aviso, Button, Card, FormField, MoneyInput } from '@/components/ui'
import { GRILLA_DOS_COLUMNAS } from '@/components/shared/formulario'
import { EstadoGuardado, useGuardadoCuenta } from '@/components/control/GuardadoCuenta'
import { setDemoInsurancePct, setDemoLimits } from '@/lib/demoTenant'
import { temaV2Activo } from '@/lib/temaV2'
import { formatGs } from '@/utils/moneda'
import { validarEnteroNoNegativo, validarPorcentajeDecimal, validarPorcentajeEntero } from '@/utils/limitesEmpresa'
import { mensajeDeGuardado } from '@/utils/guardadoCuenta'
import { cn } from '@/lib/utils'

// Grupo Comercial de Configuración (#253): seguro de ventas, límites y
// autorizaciones, fidelización y mora, y las listas de precios con sus precios
// por cantidad. Vive en su propio archivo para que cada dominio trabaje su
// grupo sin tocar Config.jsx (reparto #253).
//
// Precios se descarga recién al entrar al grupo: no engorda el chunk de
// Configuración ni el de las otras secciones.
const Precios = lazy(() => import('@/components/control/Precios'))

export default function Comercial({ account, onTenantChange, onReauth }) {
  const { actualizarEmpresa, esDemo } = useSesion()
  const demo = Boolean(esDemo)
  const v2 = temaV2Activo()
  const [seguroPct, setSeguroPct] = useState('')
  const [limiteGasto, setLimiteGasto] = useState('')
  const [limiteCompra, setLimiteCompra] = useState('')
  const [limiteBajoLista, setLimiteBajoLista] = useState('')
  const [limiteFidelizacion, setLimiteFidelizacion] = useState('')
  const [limiteMora, setLimiteMora] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [failure, setFailure] = useState('')
  // La hidratación no puede pisar lo que la persona está editando: se rellena
  // con la cuenta solo mientras nadie tocó los campos (mismo criterio que el
  // guardado transversal #162).
  const tocado = useRef(false)
  const guardadoSeguro = useGuardadoCuenta({ id: 'seguro', onReauth })
  const guardadoLimites = useGuardadoCuenta({ id: 'limites', onReauth })

  const tenant = account?.tenant
  useEffect(() => {
    if (!tenant || tocado.current) return
    setSeguroPct(tenant.insurancePct ? String(tenant.insurancePct) : '')
    setLimiteGasto(String(tenant.expenseLimitPyg ?? 1000000))
    setLimiteCompra(String(tenant.purchaseCreditLimitPyg ?? 5000000))
    setLimiteBajoLista(String(tenant.belowListPct ?? 10))
    setLimiteFidelizacion(String(tenant.loyaltyPct ?? 0))
    setLimiteMora(tenant.collectionLateFeeBpPerDay ? String(tenant.collectionLateFeeBpPerDay / 100).replace('.', ',') : '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant?.insurancePct, tenant?.expenseLimitPyg, tenant?.purchaseCreditLimitPyg, tenant?.belowListPct, tenant?.loyaltyPct, tenant?.collectionLateFeeBpPerDay])

  function editar(setter) {
    return (valor) => { tocado.current = true; setter(valor) }
  }

  // Seguro de ventas (#162): % sobre el costo que se suma al costo real de
  // cada venta nueva y afecta el margen.
  async function guardarSeguro(evento) {
    evento?.preventDefault?.()
    if (busy) return
    const validacion = validarPorcentajeEntero(seguroPct, 'El seguro')
    if (!validacion.ok) { guardadoSeguro.setEstado({ ok: false, texto: validacion.error }); setFailure(''); setNotice(''); return }
    const pct = validacion.valor === null || validacion.valor === 0 ? null : validacion.valor
    if (demo) {
      const guardado = setDemoInsurancePct(pct)
      onTenantChange?.({ insurancePct: guardado || null })
      guardadoSeguro.setEstado({ ok: true, texto: mensajeDeGuardado(guardado ? `${guardado}% del costo` : 'sin seguro') })
      setFailure(''); setNotice('Seguro guardado en este navegador (demo).')
      return
    }
    setBusy(true); setFailure(''); setNotice('')
    try {
      const data = await guardadoSeguro.ejecutar(
        () => api.patch('/api/account', { action: 'updateLimits', insurancePct: pct }),
        { etiqueta: 'el seguro', exito: (fila) => (fila?.insurancePct ? `${fila.insurancePct}% del costo` : 'sin seguro') },
      )
      if (data) {
        onTenantChange?.({ insurancePct: data.insurancePct ?? null })
        setNotice('Seguro de ventas guardado.')
      }
    } finally { setBusy(false) }
  }

  // Límites y autorizaciones + fidelización y mora: un solo guardado (Enter en
  // cualquier campo guarda el conjunto, #162).
  async function guardarLimites(evento) {
    evento?.preventDefault?.()
    if (busy) return
    const gasto = validarEnteroNoNegativo(limiteGasto, 'El límite de gasto')
    const compra = validarEnteroNoNegativo(limiteCompra, 'El límite de compra a crédito')
    const bajoLista = validarPorcentajeEntero(limiteBajoLista, 'El porcentaje bajo lista')
    const fidelizacion = validarPorcentajeEntero(limiteFidelizacion, 'El porcentaje de fidelización')
    const mora = validarPorcentajeDecimal(limiteMora, 'El recargo por mora')
    const invalido = [gasto, compra, bajoLista, fidelizacion, mora].find(resultado => !resultado.ok)
    if (invalido) { guardadoLimites.setEstado({ ok: false, texto: invalido.error }); setFailure(''); setNotice(''); return }
    const moraBp = mora.valor === null || mora.valor === 0 ? null : Math.round(mora.valor * 100)
    if (demo) {
      setDemoLimits({ expenseLimitPyg: gasto.valor, purchaseCreditLimitPyg: compra.valor, belowListPct: bajoLista.valor, loyaltyPct: fidelizacion.valor, collectionLateFeeBpPerDay: moraBp })
      onTenantChange?.({ expenseLimitPyg: gasto.valor, purchaseCreditLimitPyg: compra.valor, belowListPct: bajoLista.valor, loyaltyPct: fidelizacion.valor, collectionLateFeeBpPerDay: moraBp })
      guardadoLimites.setEstado({ ok: true, texto: mensajeDeGuardado() })
      setFailure(''); setNotice('Límites guardados en este navegador (demo).')
      return
    }
    setBusy(true); setFailure(''); setNotice('')
    try {
      const data = await guardadoLimites.ejecutar(
        () => api.patch('/api/account', { action: 'updateLimits', expenseLimitPyg: gasto.valor, purchaseCreditLimitPyg: compra.valor, belowListPct: bajoLista.valor, loyaltyPct: fidelizacion.valor, collectionLateFeeBpPerDay: mora.valor }),
        { etiqueta: 'los límites' },
      )
      if (data) {
        onTenantChange?.({ expenseLimitPyg: gasto.valor, purchaseCreditLimitPyg: compra.valor, belowListPct: bajoLista.valor, loyaltyPct: fidelizacion.valor, collectionLateFeeBpPerDay: moraBp })
        actualizarEmpresa?.({ expenseLimitPyg: gasto.valor, purchaseCreditLimitPyg: compra.valor, belowListPct: bajoLista.valor, loyaltyPct: fidelizacion.valor })
        setNotice('Límites de autorización guardados.')
      }
    } finally { setBusy(false) }
  }

  return (
    <div className="space-y-4" data-testid="config-comercial">
      {failure && <Aviso tono="error" className="p-3 rounded-xl">{failure}</Aviso>}
      {notice && <Aviso tono="ok" className="p-3 rounded-xl">{notice}</Aviso>}

      <Card className="space-y-3" data-testid="seguro-limites">
        <div>
          <h2 className="font-semibold">Seguro de ventas</h2>
          <p className="mt-1 text-sm text-mute">Porcentaje que se suma al costo real de cada venta nueva y ajusta el margen. Ej.: costo 100.000 y 25% → 125.000. El producto o la categoría pueden tener su propio porcentaje.</p>
          {demo && <p className="mt-1 rounded-lg border border-fono/30 bg-fono/5 px-3 py-2 text-xs text-fono-light">Demo: los cambios se guardan solo en este navegador y el seguro se aplica al margen que ves en Análisis → Ganancias.</p>}
        </div>
        <form
          onSubmit={guardarSeguro}
          className={cn('space-y-3 rounded-xl border border-ink-600 p-3', v2 && 'v2-tile')}
          data-testid="grupo-seguro"
        >
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <label className="flex items-center gap-2 text-sm font-semibold" htmlFor="seguro-toggle">
              <Switch id="seguro-toggle" checked={seguroPct.trim() !== '' && Number(seguroPct) > 0} onChange={(event) => editar(setSeguroPct)(event.target.checked ? (seguroPct && Number(seguroPct) > 0 ? seguroPct : '25') : '')} ariaLabel="Aplica seguro" />
              <span>Aplica seguro</span>
            </label>
            <EstadoGuardado testId="seguro-estado" estado={guardadoSeguro.estado} />
          </div>
          <div className={GRILLA_DOS_COLUMNAS}>
            <FormField label="Porcentaje sobre el costo (%)" htmlFor="seguro-pct" hint="Costo real = costo + seguro. Se guarda como número entero (sin decimales).">
              <PercentField id="seguro-pct" max={100} disabled={busy || seguroPct.trim() === ''} value={seguroPct} onChange={editar(setSeguroPct)} placeholder="25" />
            </FormField>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="outline" disabled={busy}>Guardar seguro</Button>
            <p className="text-xs text-mute">Se aplica a las ventas nuevas y se guarda con Enter.</p>
          </div>
        </form>
        {guardadoSeguro.panel}
      </Card>

      <form onSubmit={guardarLimites} className="space-y-3" data-testid="grupo-limites-form">
        <Card className={cn('space-y-3', v2 && 'v2-tile')} data-testid="grupo-limites">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <div>
              <h2 className="font-semibold">Límites y autorizaciones</h2>
              <p className="mt-1 text-sm text-mute">Por encima de estos montos, los roles operativos (cajera, vendedor) necesitan una autorización aprobada de gerencia para registrar un gasto o una compra a crédito. La venta bajo lista hasta el porcentaje indicado no pide autorización; más abajo, sí. El dueño y gerencia no la necesitan.</p>
            </div>
            <EstadoGuardado testId="limites-estado" estado={guardadoLimites.estado} />
          </div>
          <div className={GRILLA_DOS_COLUMNAS}>
            <FormField label="Gasto sin autorización (Gs)" htmlFor="limite-gasto">
              <MoneyInput id="limite-gasto" disabled={busy} value={limiteGasto} onValueChange={editar(setLimiteGasto)} placeholder="1.000.000" />
            </FormField>
            <FormField label="Compra a crédito sin autorización (Gs)" htmlFor="limite-compra">
              <MoneyInput id="limite-compra" disabled={busy} value={limiteCompra} onValueChange={editar(setLimiteCompra)} placeholder="5.000.000" />
            </FormField>
            <FormField label="Bajo lista sin autorización (%)" htmlFor="limite-bajo-lista">
              <PercentField id="limite-bajo-lista" max={100} disabled={busy} value={limiteBajoLista} onChange={editar(setLimiteBajoLista)} placeholder="10" />
            </FormField>
          </div>
          <p className="text-xs text-mute">
            Las operaciones fuera de política se piden y se aprueban en <Link to="/autorizaciones" className="font-semibold text-fono-light hover:underline">Operación → Autorizaciones</Link>, con trazabilidad en la cronología del cliente.
          </p>
        </Card>

        <Card className={cn('space-y-3', v2 && 'v2-tile')} data-testid="grupo-fidelizacion">
          <div>
            <h3 className="text-sm font-semibold">Fidelización y mora</h3>
            <p className="mt-1 text-sm text-mute">Puntos que acredita cada venta, canjeables por saldo a favor (1 punto = 1 Gs.), y recargo diario por atraso que se informa en Cobranzas.</p>
          </div>
          <div className={GRILLA_DOS_COLUMNAS}>
            <FormField label="Fidelización: puntos por venta (%)" hint="Porcentaje del total de cada venta que queda como puntos canjeables. 0 la apaga." htmlFor="limite-fidelizacion">
              <PercentField id="limite-fidelizacion" max={100} disabled={busy} value={limiteFidelizacion} onChange={editar(setLimiteFidelizacion)} placeholder="0" />
            </FormField>
            <FormField label="Recargo por mora (% diario)" htmlFor="limite-mora" hint="Vacío o 0 = sin recargo; solo se informan los días de atraso en Cobranzas.">
              <PercentField id="limite-mora" disabled={busy} value={limiteMora} onChange={editar(setLimiteMora)} placeholder="0,5" />
            </FormField>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={busy}>Guardar límites</Button>
            <p className="text-xs text-mute">Se guarda con Enter. Actual: gasto {formatGs(tenant?.expenseLimitPyg ?? 1000000)} · compra a crédito {formatGs(tenant?.purchaseCreditLimitPyg ?? 5000000)} · bajo lista {tenant?.belowListPct ?? 10}% · fidelización {tenant?.loyaltyPct ?? 0}% · mora {tenant?.collectionLateFeeBpPerDay ? `${tenant.collectionLateFeeBpPerDay / 100}% diario` : 'sin recargo'}.</p>
          </div>
          {guardadoLimites.panel}
        </Card>
      </form>

      <Suspense fallback={null}>
        <Precios />
      </Suspense>
    </div>
  )
}
