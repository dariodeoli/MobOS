import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ProductFooter from '@/components/app/ProductFooter'
import {
  getTradein,
  listCelulares,
  addVenta,
  getVendedores,
  MEDIOS_PAGO,
  ESTADOS_PAGO,
} from '@/lib/storage'
import { useLive } from '@/hooks/useLive'
import { leerUltimo, recordarUltimo } from '@/lib/ultimoUsado'
import { calcularTradein } from '@/utils/tradein'
import { fechaClave, num, gs } from '@/utils/calculos'
import { Button, Card, Input, Label, Select, Badge } from '@/components/ui'
import Icon from '@/components/shared/Icon'

const PHYS = ['excelente', 'bueno', 'regular', 'danado']
const PHYS_ICON = { excelente: '', bueno: '', regular: '', danado: '' }
const BAT = ['90-100', '80-89', '70-79', 'menos70']
const REPAIR_ICON = { pantalla: '', camara: '', bateria: '' }

const ESTADO0 = {
  model: '',
  capacity: '',
  faceId: null,
  isNew: null,
  phys: null,
  battery: null,
  repairs: [],
}

export default function TradeIn() {
  useLive()
  const navigate = useNavigate()
  const config = getTradein()

  const [s, setS] = useState(ESTADO0)
  const [q, setQ] = useState('')
  const [openDrop, setOpenDrop] = useState(false)
  const [resultado, setResultado] = useState(null)

  const dev = config.devices.find((d) => d.model === s.model)
  const hits = useMemo(
    () => config.devices.filter((d) => d.model.toLowerCase().includes(q.toLowerCase())),
    [config.devices, q],
  )

  function reset() {
    setS(ESTADO0)
    setQ('')
    setResultado(null)
  }

  function pickModel(model) {
    setS({ ...ESTADO0, model })
    setQ(model)
    setOpenDrop(false)
  }

  const seminuevoCompleto = s.isNew === 'seminuevo' && s.phys && s.battery && s.repairs.length > 0
  const listoParaCalcular =
    s.model && s.capacity && s.faceId === true && (s.isNew === 'nuevo' || seminuevoCompleto)

  function calcular() {
    const r = calcularTradein(s, config)
    setResultado(r)
  }

  if (resultado) {
    return (
      <Resultado
        s={s}
        resultado={resultado}
        config={config}
        onReset={reset}
        onSalir={() => navigate('/')}
      />
    )
  }

  return (
    <div className="min-h-dvh bg-ink-700">
      <header className="sticky top-0 z-30 bg-fono text-onbrand pt-safe shadow-md">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold">Trade-In</div>
          <div className="flex items-center gap-3">
            <span className="text-xs opacity-80 hidden sm:inline">
              1 USD = {gs(config.exchangeRate)}
            </span>
            <Button
              variant="ghost"
              className="text-onbrand hover:bg-ink-800/15"
              onClick={() => navigate('/')}
            >
              Volver
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 space-y-3">
        {/* Paso 1: Modelo */}
        <Card>
          <Paso n={1}>Modelo del equipo</Paso>
          <p className="text-xs text-mute mb-2">Solo iPhone 11 en adelante.</p>
          <div className="relative">
            <Input
              value={q}
              onChange={(e) => {
                setQ(e.target.value)
                setOpenDrop(true)
                if (s.model) setS(ESTADO0)
              }}
              onFocus={() => setOpenDrop(true)}
              placeholder="Ej: iPhone 15 Pro Max…"
            />
            {openDrop && q && !s.model && (
              <div className="absolute z-20 left-0 right-0 mt-1 bg-ink-800 border-2 border-ink-600 rounded-xl max-h-56 overflow-y-auto shadow-lg">
                {hits.length ? (
                  hits.map((d) => (
                    <button
                      key={d.model}
                      onClick={() => pickModel(d.model)}
                      className="block w-full text-left px-4 py-2.5 text-sm hover:bg-fono/10 border-b border-ink-600 last:border-0"
                    >
                      {d.model}
                    </button>
                  ))
                ) : (
                  <div className="px-4 py-3 text-sm text-mute">Sin resultados</div>
                )}
              </div>
            )}
          </div>
          {s.model && (
            <div className="mt-2">
              <Badge color="blue"> {s.model}</Badge>
            </div>
          )}
        </Card>

        {/* Paso 2: Capacidad */}
        {dev && (
          <Card>
            <Paso n={2}>Capacidad</Paso>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {dev.capacities.map((c) => (
                <button
                  key={c}
                  onClick={() =>
                    setS((p) => ({
                      ...p,
                      capacity: c,
                      faceId: null,
                      isNew: null,
                      phys: null,
                      battery: null,
                      repairs: [],
                    }))
                  }
                  className={
                    'rounded-xl border-2 p-3 text-center transition ' +
                    (s.capacity === c
                      ? 'border-fono bg-fono/10'
                      : 'border-ink-600 hover:border-fono')
                  }
                >
                  <div className="text-lg">
                    <Icon name="save" className="h-4 w-4" />
                  </div>
                  <div className="font-bold text-sm">{c}</div>
                  <div className="text-[10px] text-mute">Base ${dev.prices[c]}</div>
                </button>
              ))}
            </div>
          </Card>
        )}

        {/* Paso 3: Face ID */}
        {s.capacity && (
          <Card>
            <Paso n={3}>¿Tiene Face ID funcionando?</Paso>
            <p className="text-xs text-mute mb-2">
              Verificá desbloqueando con la cara del cliente.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Opcion
                sel={s.faceId === true}
                onClick={() => setS((p) => ({ ...p, faceId: true }))}
                icon=""
                titulo="Sí, funciona"
              />
              <Opcion
                sel={s.faceId === false}
                onClick={() => setS((p) => ({ ...p, faceId: false, isNew: null }))}
                icon=""
                titulo="No tiene / no funciona"
                danger
              />
            </div>
            {s.faceId === false && (
              <div className="mt-3 bg-bad/10 border-2 border-bad rounded-xl p-4 text-center">
                <div className="text-2xl">
                  <Icon name="eyeOff" className="h-4 w-4" />
                </div>
                <div className="font-extrabold text-bad">Equipo NO aceptado</div>
                        <div className="text-sm text-bad">Mobtock no toma equipos sin Face ID.</div>
              </div>
            )}
          </Card>
        )}

        {/* Paso 4: Nuevo / Seminuevo */}
        {s.faceId === true && (
          <Card>
            <Paso n={4}>¿Nuevo o seminuevo?</Paso>
            <div className="grid grid-cols-2 gap-2">
              <Opcion
                sel={s.isNew === 'nuevo'}
                onClick={() =>
                  setS((p) => ({ ...p, isNew: 'nuevo', phys: 'nuevo', battery: null, repairs: [] }))
                }
                icon=""
                titulo="Nuevo"
                sub="Sellado o sin uso"
              />
              <Opcion
                sel={s.isNew === 'seminuevo'}
                onClick={() =>
                  setS((p) => ({
                    ...p,
                    isNew: 'seminuevo',
                    phys: null,
                    battery: null,
                    repairs: [],
                  }))
                }
                icon=""
                titulo="Seminuevo"
                sub="Ya utilizado"
              />
            </div>
          </Card>
        )}

        {/* Paso 5: Condición seminuevo */}
        {s.isNew === 'seminuevo' && (
          <Card className="space-y-4">
            <div>
              <Paso n={5}>Estado físico</Paso>
              <div className="grid grid-cols-2 gap-2">
                {PHYS.map((k) => (
                  <Opcion
                    key={k}
                    sel={s.phys === k}
                    onClick={() => setS((p) => ({ ...p, phys: k }))}
                    icon={PHYS_ICON[k]}
                    titulo={config.conditionMultipliers[k].label}
                    sub={`${Math.round(config.conditionMultipliers[k].value * 100)}% del precio`}
                  />
                ))}
              </div>
            </div>

            <div>
              <div className="font-bold text-sm mb-2">Salud de la batería</div>
              <div className="grid grid-cols-2 gap-2">
                {BAT.map((k) => (
                  <Opcion
                    key={k}
                    sel={s.battery === k}
                    onClick={() => setS((p) => ({ ...p, battery: k }))}
                    icon=""
                    titulo={config.batteryMultipliers[k].label}
                    sub={config.batteryMultipliers[k].desc}
                  />
                ))}
              </div>
            </div>

            <div>
              <div className="font-bold text-sm mb-2">Reparaciones por terceros</div>
              <div className="space-y-2">
                {Object.keys(config.repairMultipliers).map((k) => {
                  const activo = s.repairs.includes(k)
                  return (
                    <button
                      key={k}
                      onClick={() =>
                        setS((p) => ({
                          ...p,
                          repairs: activo
                            ? p.repairs.filter((x) => x !== k)
                            : [...p.repairs.filter((x) => x !== 'ninguna'), k],
                        }))
                      }
                      className={
                        'w-full flex items-center gap-3 rounded-xl border-2 p-3 text-left transition ' +
                        (activo ? 'border-fono bg-fono/10' : 'border-ink-600')
                      }
                    >
                      <span className="text-xl">{REPAIR_ICON[k]}</span>
                      <span className="flex-1 text-sm font-semibold">
                        {config.repairMultipliers[k].label}
                      </span>
                      <span>{activo ? '' : ''}</span>
                    </button>
                  )
                })}
                <button
                  onClick={() => setS((p) => ({ ...p, repairs: ['ninguna'] }))}
                  className={
                    'w-full flex items-center gap-3 rounded-xl border-2 p-3 text-left transition ' +
                    (s.repairs.length === 1 && s.repairs[0] === 'ninguna'
                      ? 'border-ok bg-ok/10'
                      : 'border-ink-600')
                  }
                >
                  <span className="text-xl">
                    <Icon name="check" className="h-4 w-4" />
                  </span>
                  <span className="flex-1 text-sm font-semibold">Sin reparaciones de terceros</span>
                  <span>{s.repairs.length === 1 && s.repairs[0] === 'ninguna' ? '' : ''}</span>
                </button>
              </div>
            </div>
          </Card>
        )}

        <Button
          variant="success"
          className="w-full"
          disabled={!listoParaCalcular}
          onClick={calcular}
        >
          Calcular precio de trade-in
        </Button>
      </main>
      <ProductFooter />
    </div>
  )
}

function Paso({ n, children }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-fono text-onbrand text-xs font-bold">
        {n}
      </span>
      <h2 className="font-bold">{children}</h2>
    </div>
  )
}

function Opcion({ sel, onClick, icon, titulo, sub, danger }) {
  return (
    <button
      onClick={onClick}
      className={
        'rounded-xl border-2 p-3 text-center transition ' +
        (sel
          ? 'border-fono bg-fono/10'
          : danger
            ? 'border-bad/25 hover:border-bad'
            : 'border-ink-600 hover:border-fono')
      }
    >
      <div className="text-2xl">{icon}</div>
      <div className="font-bold text-sm">{titulo}</div>
      {sub && <div className="text-[11px] text-mute">{sub}</div>}
    </button>
  )
}

// ── Resultado + conversión a venta ──────────────────────────────────
function Resultado({ s, resultado, config, onReset, onSalir }) {
  const celulares = listCelulares().filter((c) => c.activo && c.precio > 0)
  const vendedores = getVendedores().filter((v) => v.activo)
  const [celId, setCelId] = useState('')
  const [vendedorId, setVendedorId] = useState(
    () => leerUltimo('pos:vendedor', { porDefecto: '', legado: 'fono:ultimoVendedor' }),
  )
  const [cliente, setCliente] = useState('')
  const [estadoPago, setEstadoPago] = useState(ESTADOS_PAGO[0])
  const [medioPago, setMedioPago] = useState(MEDIOS_PAGO[0])
  const [guardada, setGuardada] = useState(false)

  const cel = celulares.find((c) => c.id === celId)
  const neto = cel ? Math.max(0, num(cel.precio) - resultado.pyg) : 0

  const condLabel = s.isNew === 'nuevo' ? 'Nuevo' : config.conditionMultipliers[s.phys]?.label

  function registrar() {
    if (!cel || !cliente.trim() || !vendedorId) return
    recordarUltimo('pos:vendedor', vendedorId)
    addVenta({
      vendedorId,
      cliente: cliente.trim(),
      productoId: 'celular',
      productoNombre: `${cel.modelo} ${cel.capacidad} (${cel.estado})`,
      estadoPago,
      fecha: fechaClave(),
      precio: neto,
      medioPago,
      entrega: 'Retiro en tienda',
      montoDelivery: 0,
      observacion: `Trade-In: ${s.model} ${s.capacity} (${condLabel}) − valorado en ${gs(resultado.pyg)}`,
    })
    setGuardada(true)
  }

  return (
    <div className="min-h-dvh bg-ink-700">
      <header className="sticky top-0 z-30 bg-fono text-onbrand pt-safe shadow-md">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="font-bold">Resultado del Trade-In</div>
          <Button variant="ghost" className="text-onbrand hover:bg-ink-800/15" onClick={onSalir}>
            Volver
          </Button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 space-y-3">
        <Card className="bg-gradient-to-br from-fono-dark via-fono to-fono-accent text-onbrand border-0 text-center py-7">
          <div className="text-xs uppercase tracking-wide opacity-75 font-bold">
            Valor de Trade-In
          </div>
          <div className="text-4xl font-extrabold mt-1">{gs(resultado.pyg)}</div>
          <div className="text-lg opacity-80 mt-1">USD {resultado.usd.toLocaleString('en-US')}</div>
          <div className="text-[11px] opacity-60 mt-1">
            1 USD = {gs(config.exchangeRate)} · {config.exchangeSource}
          </div>
        </Card>

        <Card>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <Dato label="Modelo" valor={s.model} />
            <Dato label="Capacidad" valor={s.capacity} />
            <Dato label="Condición" valor={condLabel} />
            <Dato
              label="Batería"
              valor={s.isNew === 'nuevo' ? '—' : config.batteryMultipliers[s.battery]?.label}
            />
          </div>
        </Card>

        {/* Equipo de interés venta */}
        <Card>
          <h2 className="font-bold mb-1">¿Qué equipo se lleva el cliente?</h2>
          <p className="text-xs text-mute mb-3">
            Elegí el equipo de la lista de precios para ver cuánto paga con el trade-in.
          </p>
          {celulares.length === 0 ? (
            <Badge color="orange">Cargá precios en Centro de Control Celulares</Badge>
          ) : (
            <>
              <Select value={celId} onChange={(e) => setCelId(e.target.value)}>
                <option value="">— Seleccionar equipo —</option>
                {celulares.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.modelo} {c.capacidad} · {gs(c.precio)}
                  </option>
                ))}
              </Select>

              {cel && (
                <div className="mt-3 bg-fono/10 rounded-xl p-4">
                  <div className="flex justify-between text-sm">
                    <span>Precio {cel.modelo}</span>
                    <span className="font-bold">{gs(cel.precio)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-ok">
                    <span>− Trade-In ({s.model})</span>
                    <span className="font-bold">− {gs(resultado.pyg)}</span>
                  </div>
                  <div className="flex justify-between text-lg font-extrabold border-t border-fono/20 mt-2 pt-2 text-fono">
                    <span>Paga</span>
                    <span>{gs(neto)}</span>
                  </div>
                </div>
              )}

              {cel && !guardada && (
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="sm:col-span-2">
                    <Label htmlFor="vendedor">Vendedor</Label>
                    <Select id="vendedor" value={vendedorId} onChange={(e) => setVendedorId(e.target.value)}>
                      <option value="">— ¿Quién hace esta venta? —</option>
                      {vendedores.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.nombre}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="sm:col-span-2">
                    <Label htmlFor="cliente">Cliente</Label>
                    <Input id="cliente"
                      value={cliente}
                      onChange={(e) => setCliente(e.target.value)}
                      placeholder="Nombre del cliente"
                      autoCapitalize="words"
                    />
                  </div>
                  <div>
                    <Label htmlFor="estado-de-pago">Estado de pago</Label>
                    <Select id="estado-de-pago" value={estadoPago} onChange={(e) => setEstadoPago(e.target.value)}>
                      {ESTADOS_PAGO.map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="medio-de-pago">Medio de pago</Label>
                    <Select id="medio-de-pago" value={medioPago} onChange={(e) => setMedioPago(e.target.value)}>
                      {MEDIOS_PAGO.map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </Select>
                  </div>
                  <Button
                    variant="success"
                    className="sm:col-span-2"
                    disabled={!cliente.trim() || !vendedorId}
                    onClick={registrar}
                  >
                    Registrar venta con trade-in ({gs(neto)})
                  </Button>
                </div>
              )}

              {guardada && (
                <div className="mt-3 bg-ok/10 border border-ok/25 rounded-xl p-3 text-ok text-sm font-semibold">
                  ¡Venta registrada! El trade-in quedó anotado en la observación.
                </div>
              )}
            </>
          )}
        </Card>

        <Button variant="outline" className="w-full" onClick={onReset}>
          Nueva cotización
        </Button>
      </main>
      <ProductFooter />
    </div>
  )
}

function Dato({ label, valor }) {
  return (
    <div className="bg-ink-700 rounded-lg p-2.5">
      <div className="text-[10px] uppercase font-bold text-mute">{label}</div>
      <div className="font-bold text-sm">{valor || '—'}</div>
    </div>
  )
}
