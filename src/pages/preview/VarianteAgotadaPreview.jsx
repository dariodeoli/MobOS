// Diseño A5 (#279, ampliación de #250): **variante agotada** — el comprador
// propone alternativas; el vendedor o el cliente decide (con código OTP si
// cambia el precio).
//
// Preview de diseño (DEV): datos ficticios, sin API. Puntos de integración para
// CRM (decisión del cliente y aviso), POS (pedido/carrito) y CMP (bloque de
// código) en `docs/DISENO-279-A3-A5.md`.
import { useState } from 'react'
import { Aviso, Badge, Button, Card, FilaDato, PinInput } from '@/components/ui'
import { PIE_ACCIONES } from '@/components/shared/formulario'
import Icon from '@/components/shared/Icon'
import BarraModulo from '@/components/shared/BarraModulo'
import { gs } from '@/utils/calculos'

const PASOS = [
  ['proponer', '1 · Proponer'],
  ['enviada', '2 · Enviada'],
  ['decidir', '3 · Decisión'],
  ['resultado', '4 · Resultado'],
]

const ALTERNATIVAS = [
  { id: 'negro', titulo: 'iPhone 15 Pro 256 GB · Negro', stock: 'Sucursal Centro · 2 disponibles', precio: 8250000, delta: 0 },
  { id: '512', titulo: 'iPhone 15 Pro 512 GB · Titanio natural', stock: 'En tránsito · llega 3/10', precio: 9150000, delta: 900000 },
  { id: 'max', titulo: 'iPhone 15 Pro Max 256 GB · Titanio', stock: 'Sucursal Shopping · 1 disponible', precio: 9650000, delta: 1400000 },
]

export default function VarianteAgotadaPreview() {
  const [paso, setPaso] = useState('proponer')
  const [elegida, setElegida] = useState(ALTERNATIVAS[1])
  const [codigo, setCodigo] = useState('')
  const cambiaPrecio = elegida.delta !== 0

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4" data-testid="a5-preview" data-paso={paso}>
      <BarraModulo
        icono="box"
        titulo="Variante agotada"
        descripcion="El comprador propone una variante con stock; el vendedor o el cliente acepta. Si cambia el precio, la decisión pide código."
        testId="barra-a5"
      />

      <div className="flex flex-wrap gap-1 rounded-xl border border-ink-600 bg-ink-800 p-1" role="group" aria-label="Pasos del diseño">
        {PASOS.map(([id, etiqueta]) => (
          <button
            key={id}
            type="button"
            aria-pressed={paso === id}
            onClick={() => setPaso(id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${paso === id ? 'bg-fono/15 text-fono-light' : 'text-mute hover:text-fore'}`}
          >
            {etiqueta}
          </button>
        ))}
      </div>

      <Card className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-wider text-mute">Pedido P-0042</p>
            <h2 className="text-lg font-bold">iPhone 15 Pro 256 GB · Titanio natural</h2>
            <p className="mt-0.5 text-sm text-mute">Pedido por el cliente · Gs 8.250.000</p>
          </div>
          <Badge color="orange">Sin stock · llega en 6 días</Badge>
        </div>
        <p className="rounded-xl border border-ink-600 p-3 text-sm text-mute">
          El modelo pedido no está disponible. <b className="text-fore">Proponé una alternativa con stock</b>: si el precio sube o baja, la decisión se aprueba con código.
        </p>
      </Card>

      {paso === 'proponer' && (
        <Card className="space-y-3">
          <h3 className="text-sm font-semibold">Alternativas con stock</h3>
          {ALTERNATIVAS.map((alt) => (
            <div key={alt.id} className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 ${elegida.id === alt.id ? 'border-fono/40 bg-fono/5' : 'border-ink-600'}`}>
              <div className="min-w-0">
                <p className="font-semibold">{alt.titulo}</p>
                <p className="text-xs text-mute">{alt.stock}</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="font-semibold">{gs(alt.precio)}</p>
                  {alt.delta === 0
                    ? <p className="text-xs text-ok">Mismo precio · sin código</p>
                    : <p className="text-xs text-warn">{alt.delta > 0 ? '+' : '−'}{gs(Math.abs(alt.delta))} · pide código</p>}
                </div>
                <Button type="button" variant={elegida.id === alt.id ? 'primary' : 'outline'} onClick={() => setElegida(alt)}>
                  {elegida.id === alt.id ? 'Elegida' : 'Elegir'}
                </Button>
              </div>
            </div>
          ))}
          <div className={PIE_ACCIONES}>
            <Button type="button" variant="ghost">Mantener la original (espera)</Button>
            <Button type="button" onClick={() => setPaso('enviada')}><Icon name="send" className="h-4 w-4" />Proponer al cliente</Button>
          </div>
        </Card>
      )}

      {paso === 'enviada' && (
        <Card className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Propuesta enviada</h3>
            {cambiaPrecio ? <Badge color="orange">Requiere aprobación con código</Badge> : <Badge color="green">Sin cambio de precio</Badge>}
          </div>
          <div className="space-y-1 rounded-xl border border-ink-600 p-3">
            <FilaDato etiqueta="Variante propuesta" valor={elegida.titulo} />
            <FilaDato etiqueta="Precio" valor={gs(elegida.precio)} />
            <FilaDato etiqueta="Diferencia" valor={elegida.delta === 0 ? 'Sin diferencia' : `${elegida.delta > 0 ? '+' : '−'}${gs(Math.abs(elegida.delta))}`} tono={elegida.delta === 0 ? 'ok' : 'warn'} />
            <FilaDato etiqueta="Decide" valor="El cliente (portal) o el vendedor" tono="mute" />
            <FilaDato etiqueta="Expira" valor="En 24 h (28/09 15:40)" tono="mute" />
          </div>
          <div className={PIE_ACCIONES}>
            <Button type="button" variant="ghost"><Icon name="refresh" className="h-4 w-4" />Recordar al cliente</Button>
            <Button type="button" onClick={() => setPaso('decidir')}>Ver la decisión</Button>
          </div>
        </Card>
      )}

      {paso === 'decidir' && (
        <Card className="space-y-4">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-warn/15 text-warn"><Icon name="lock" className="h-5 w-5" /></span>
            <div>
              <h2 className="text-lg font-bold">Aprobación de la alternativa</h2>
              <p className="text-sm text-mute">{elegida.titulo} · {gs(elegida.precio)} {cambiaPrecio && <>· <b className="text-warn">{elegida.delta > 0 ? '+' : '−'}{gs(Math.abs(elegida.delta))}</b></>}</p>
            </div>
          </div>

          {cambiaPrecio ? (
            <>
              <p className="text-sm text-mute">Como cambia el precio, el cliente (o el vendedor con su clave) confirma con un código de 6 dígitos. Sin código no se cambia la variante.</p>
              <div className="flex justify-center py-1">
                <PinInput value={codigo} onChange={setCodigo} length={6} ariaLabel="Código de la alternativa" />
              </div>
              <p className="text-xs text-mute">Se envió al cliente por WhatsApp (<b className="text-fore">•••• 4321</b>) · vence en 10:00.</p>
            </>
          ) : (
            <Aviso tono="ok">Mismo precio: alcanza con aceptar, sin código.</Aviso>
          )}

          <div className={PIE_ACCIONES}>
            <Button type="button" variant="ghost">Rechazar</Button>
            <Button type="button" onClick={() => setPaso('resultado')}><Icon name="check" className="h-4 w-4" />Aceptar alternativa</Button>
          </div>
        </Card>
      )}

      {paso === 'resultado' && (
        <Card className="space-y-4">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ok/15 text-ok"><Icon name="check" className="h-5 w-5" /></span>
            <div>
              <h2 className="text-lg font-bold">Alternativa aceptada</h2>
              <p className="text-sm text-mute">El pedido P-0042 se actualizó: el cliente ya tiene su variante con stock.</p>
            </div>
          </div>
          <div className="space-y-1 rounded-xl border border-ink-600 p-3">
            <FilaDato etiqueta="Variante final" valor={elegida.titulo} />
            <FilaDato etiqueta="Precio actualizado" valor={gs(elegida.precio)} />
            <FilaDato etiqueta="Decidió" valor={cambiaPrecio ? 'Cliente · código 6 dígitos' : 'Cliente · aceptación simple'} tono="mute" />
            <FilaDato etiqueta="Cuándo" valor="27/09/2026 16:05" tono="mute" />
          </div>
          <div className={PIE_ACCIONES}>
            <Button type="button" variant="ghost" onClick={() => setPaso('decidir')}>Volver a la decisión</Button>
            <Button type="button" onClick={() => setPaso('proponer')}>Nueva propuesta</Button>
          </div>
        </Card>
      )}

      <p className="text-center text-xs text-mute">Preview de diseño · datos ficticios · no toca pedidos reales.</p>
    </div>
  )
}
