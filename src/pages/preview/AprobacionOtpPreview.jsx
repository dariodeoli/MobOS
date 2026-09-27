// Diseño A3 (#279, ampliación de #250): presupuesto con **aprobación
// autenticada** — OTP + versión congelada + constancia (hash, firma opcional).
//
// Es un **preview de diseño** (DEV): datos ficticios, sin API ni backend. La
// pantalla es la propuesta para que FIN (presupuestos/autorizaciones) y CMP
// (objeto de código OTP reutilizable) la implementen; ver
// `docs/DISENO-279-A3-A5.md` para los puntos de integración.
import { useState } from 'react'
import { Aviso, Badge, Button, Card, FilaDato, Nota, PinInput } from '@/components/ui'
import { PIE_ACCIONES } from '@/components/shared/formulario'
import Icon from '@/components/shared/Icon'
import BarraModulo from '@/components/shared/BarraModulo'

const PASOS = [
  ['solicitud', '1 · Solicitud'],
  ['codigo', '2 · Código'],
  ['constancia', '3 · Constancia'],
]

const HASH_CORTO = '3f9a…3e10'
const HASH_LARGO = 'sha256:3f9ac21d88b407ee51a09d3c44b16f2e90887c15ab32d0f46e7721c95b8a3e10'

export default function AprobacionOtpPreview() {
  const [paso, setPaso] = useState('solicitud')
  const [codigo, setCodigo] = useState('')

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4" data-testid="a3-preview" data-paso={paso}>
      <BarraModulo
        icono="lock"
        titulo="Presupuesto con aprobación"
        descripcion="El presupuesto se congela al pedir la aprobación: se aprueba con código y queda constancia. Si cambia algo, es una versión nueva."
        testId="barra-a3"
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

      {paso === 'solicitud' && (
        <Card className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-xs uppercase tracking-wider text-mute">Presupuesto</p>
              <h2 className="text-lg font-bold">P-0018 · Aurora Móviles S.A.</h2>
              <p className="mt-0.5 text-sm text-mute">iPhone 15 Pro 256 GB Titanio ×1 · Case MagSafe ×1</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge color="blue">Versión 2 · congelada</Badge>
              <span className="rounded-lg border border-ink-600 bg-ink-800 px-2 py-1 font-mono text-[11px] text-mute" title={HASH_LARGO}>{HASH_CORTO}</span>
            </div>
          </div>

          <div className="space-y-1 rounded-xl border border-ink-600 p-3">
            <FilaDato etiqueta="Subtotal" valor="Gs 8.250.000" />
            <FilaDato etiqueta="Descuento" valor="−Gs 250.000" />
            <FilaDato etiqueta="Total" valor={<span className="text-base font-bold">Gs 8.000.000</span>} />
            <FilaDato etiqueta="Vigencia" valor="7 días (vence 4/10)" tono="mute" />
          </div>

          <div className="space-y-1">
            <FilaDato etiqueta="Pidió la aprobación" valor="Vendedor E2E Uno" tono="mute" />
            <FilaDato etiqueta="Aprueba" valor="Dueño / Administrador (OTP)" tono="mute" />
            <FilaDato etiqueta="Condición" valor="Descuento mayor al 5 %" tono="mute" />
          </div>

          <Nota tono="info">
            <b className="text-fore">Al aprobar</b> se congela esta versión y queda la constancia (hash, quién y cuándo). Cualquier cambio después genera la <b className="text-fore">versión 3</b> y vuelve a pedir aprobación.
          </Nota>

          <div className={PIE_ACCIONES}>
            <Button type="button" variant="ghost"><Icon name="close" className="h-4 w-4" />Rechazar</Button>
            <Button type="button" onClick={() => setPaso('codigo')}><Icon name="send" className="h-4 w-4" />Pedir código de aprobación</Button>
          </div>
        </Card>
      )}

      {paso === 'codigo' && (
        <Card className="space-y-4">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-fono/15 text-fono-light"><Icon name="lock" className="h-5 w-5" /></span>
            <div>
              <h2 className="text-lg font-bold">Ingresá el código</h2>
              <p className="text-sm text-mute">Se envió un código de 6 dígitos al dueño por WhatsApp y correo (<b className="text-fore">•••• 4321</b>). Vence en <b className="text-fore">5:00</b>.</p>
            </div>
          </div>

          <div className="flex justify-center py-1">
            <PinInput value={codigo} onChange={setCodigo} length={6} ariaLabel="Código de aprobación" autoFocus />
          </div>

          <Aviso tono="warn" role="status" className="text-xs">
            Código incorrecto. Te quedan <b>2 intentos</b> antes de bloquear 10 minutos.
          </Aviso>

          <div className="flex flex-wrap justify-between gap-2">
            <Button type="button" variant="ghost" disabled><Icon name="refresh" className="h-4 w-4" />Reenviar en 0:28</Button>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => setPaso('solicitud')}>Volver</Button>
              <Button type="button" onClick={() => setPaso('constancia')}>Verificar y aprobar</Button>
            </div>
          </div>
        </Card>
      )}

      {paso === 'constancia' && (
        <Card className="space-y-4">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ok/15 text-ok"><Icon name="check" className="h-5 w-5" /></span>
            <div>
              <h2 className="text-lg font-bold">Presupuesto aprobado</h2>
              <p className="text-sm text-mute">Quedó bloqueado en la <b className="text-fore">versión 2</b> y listo para enviar al cliente.</p>
            </div>
          </div>

          <div className="space-y-1 rounded-xl border border-ink-600 p-3">
            <FilaDato etiqueta="Aprobó" valor="Hernán Acosta (Dueño)" />
            <FilaDato etiqueta="Cuándo" valor="27/09/2026 15:42" />
            <FilaDato etiqueta="Canal" valor="WhatsApp · código 6 dígitos" tono="mute" />
            <FilaDato etiqueta="Intentos" valor="1 (sin bloqueos)" tono="mute" />
            <FilaDato etiqueta="Firma" valor="Adjunta (responsable)" tono="mute" />
          </div>

          <div>
            <p className="mb-1 text-xs uppercase tracking-wider text-mute">Constancia</p>
            <code className="block overflow-x-auto rounded-lg border border-ink-600 bg-ink-800 p-2 font-mono text-[11px] text-mute">{HASH_LARGO}</code>
            <p className="mt-1 text-xs text-mute">El hash identifica la versión congelada: si el contenido cambia, el hash cambia.</p>
          </div>

          <div className={PIE_ACCIONES}>
            <Button type="button" variant="ghost"><Icon name="download" className="h-4 w-4" />Descargar constancia</Button>
            <Button type="button"><Icon name="printer" className="h-4 w-4" />Imprimir aprobación</Button>
          </div>
        </Card>
      )}

      <p className="text-center text-xs text-mute">Preview de diseño · datos ficticios · no ejecuta aprobaciones reales.</p>
    </div>
  )
}
