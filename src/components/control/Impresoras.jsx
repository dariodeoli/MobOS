import { useCallback, useEffect, useState } from 'react'
import { Badge, Button, Card, Eyebrow, FormField, Input, Select, useToast } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import { URL_AGENTE, configImpresora, estadoAgente, guardarConfigImpresora, imprimirTicketDirecto } from '@/lib/printing/agent'
import { ticketPrueba } from '@/lib/printing/tickets'

// Impresoras: conecta la app con el agente local (print-agent) que imprime
// ESC/POS directo por LAN o USB, sin diálogo del navegador.
export default function Impresoras() {
  const toast = useToast()
  const [config, setConfig] = useState(configImpresora)
  const [estado, setEstado] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [probando, setProbando] = useState(false)
  const [diagnosticando, setDiagnosticando] = useState(false)
  const [diagnostico, setDiagnostico] = useState(null)

  const consultar = useCallback(async () => {
    setCargando(true)
    try {
      const resultado = await estadoAgente({ forzar: true })
      setEstado(resultado)
      if (resultado.disponible && resultado.impresora && !configImpresora().impresora) {
        setConfig(actual => ({ ...actual, impresora: resultado.impresora, ancho: resultado.ancho || actual.ancho }))
      }
    } finally { setCargando(false) }
  }, [])
  useEffect(() => { consultar() }, [consultar])

  function guardar() {
    const siguiente = guardarConfigImpresora({ url: config.url.trim() || URL_AGENTE, impresora: config.impresora.trim(), ancho: Number(config.ancho), copias: Number(config.copias), token: config.token.trim() })
    setConfig(siguiente)
    toast.success('Impresora guardada', siguiente.impresora || 'Elegí una impresora para imprimir directo.')
  }

  async function probar() {
    if (probando) return
    setProbando(true)
    const guardada = guardarConfigImpresora({ impresora: config.impresora.trim(), ancho: Number(config.ancho), copias: 1, token: config.token.trim() })
    const resultado = await imprimirTicketDirecto(ticketPrueba({ ancho: guardada.ancho, impresora: guardada.impresora }), { copias: 1 })
    setProbando(false)
    if (resultado.ok) {
      toast.success(resultado.encolado ? 'Prueba encolada' : 'Prueba enviada', resultado.encolado ? 'La impresora no respondió; el agente reintenta solo.' : 'Si no salió, revisá el ancho y la conexión.')
      consultar()
    } else {
      toast.error('No se pudo imprimir', resultado.error)
    }
  }

  async function diagnosticar() {
    if (diagnosticando) return
    setDiagnosticando(true)
    try {
      const { url, token } = configImpresora()
      const respuesta = await fetch(`${url}/diagnostico`, { headers: token ? { 'x-mobos-print-token': token } : {}, targetAddressSpace: 'local' })
      setDiagnostico(await respuesta.json())
    } catch (cause) {
      setDiagnostico({ ok: false, error: cause?.message || 'No se pudo consultar el diagnóstico.' })
    } finally { setDiagnosticando(false) }
  }

  const usb = estado?.impresoras?.usb || []
  const lan = estado?.impresoras?.lan || []

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <Eyebrow>Impresión térmica</Eyebrow>
            <h2 className="mt-1 font-semibold">Agente local</h2>
            <p className="mt-1 text-sm text-mute">El agente imprime directo en la térmica (58 u 80 mm) por LAN o USB, sin el diálogo del navegador. Se instala en esta computadora con <code className="rounded bg-ink-700 px-1">bash print-agent/install-macos.sh</code>.</p>
          </div>
          <Badge color={estado?.disponible ? 'green' : 'slate'}>
            {cargando ? 'Consultando…' : estado?.disponible ? `Conectado · v${estado.version || ''}` : 'Sin agente'}
          </Badge>
        </div>
        {!estado?.disponible && !cargando && (
          <p className="rounded-xl border border-warn/30 bg-warn/10 p-3 text-sm text-mute">
            No se encontró el agente en <b className="text-fore">127.0.0.1:17890</b>. Mientras tanto la app imprime con el diálogo de siempre (A4 o 58 mm). Después de instalarlo, Chrome va a pedir una vez permiso de “acceso a la red local”: hay que aceptarlo.
          </p>
        )}
        {estado?.disponible && estado.impresora && estado.impresoraOk === false && (
          <p role="alert" className="rounded-xl border border-bad/30 bg-bad/10 p-3 text-sm text-bad">
            La impresora <b>{estado.impresora}</b> no responde desde esta computadora. Revisá que estén en la misma red
            (por ejemplo, la Mac en <b>192.168.1.x</b> y la impresora en <b>192.168.1.23</b>): lo ideal es que el router
            y la impresora compartan la subred, no cambiar la IP de la Mac a mano. Si la impresora está conectada por USB,
            usá la cola detectada (<b>usb:ZKP8008</b>): imprime igual y no depende de la red. Después tocá “Actualizar estado”.
          </p>
        )}
        {estado?.disponible && estado.impresoraOk === true && (
          <p className="text-xs text-ok">La impresora responde desde esta computadora.</p>
        )}
        {estado?.disponible && (
          <div className="flex flex-wrap gap-4 text-xs text-mute">
            <span>Cola: <b className="text-fore">{estado.cola?.pendientes || 0} pendientes</b>{estado.cola?.fallidos ? ` · ${estado.cola.fallidos} fallidos` : ''}</span>
            {estado.impresoras?.lan?.length ? <span>LAN: <b className="text-fore">{estado.impresoras.lan.join(', ')}</b></span> : null}
            {usb.length ? <span>USB: <b className="text-fore">{usb.join(', ')}</b></span> : null}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={consultar} disabled={cargando}><Icon name="refresh" className="h-3.5 w-3.5" />Actualizar estado</Button>
          {estado?.disponible && <Button type="button" variant="ghost" onClick={diagnosticar} disabled={diagnosticando}>{diagnosticando ? 'Consultando…' : 'Diagnóstico de red'}</Button>}
        </div>
        {diagnostico && (
          <pre className="overflow-x-auto rounded-xl border border-ink-600 bg-ink-800 p-3 text-[11px] text-mute">{JSON.stringify(diagnostico, null, 2)}</pre>
        )}
      </Card>

      <Card className="space-y-3">
        <div>
          <h2 className="font-semibold">Impresora y formato</h2>
          <p className="mt-1 text-sm text-mute">Destino LAN como <b className="text-fore">lan:192.168.1.23:9100</b> o USB como <b className="text-fore">usb:NombreDeLaCola</b>. La térmica ya viene configurada en <b className="text-fore">192.168.1.23</b> con cortador automático: solo tiene que estar en la misma red que esta computadora.</p>
        </div>
        <FormField label="Dirección del agente" htmlFor="impresora-agente">
          <Input id="impresora-agente" value={config.url} onChange={event => setConfig(actual => ({ ...actual, url: event.target.value }))} placeholder="http://127.0.0.1:17890" autoCapitalize="off" spellCheck={false} />
        </FormField>
        <p className="text-xs text-mute">En la computadora puente dejá <b className="text-fore">http://127.0.0.1:17890</b>. En las demás computadoras y móviles, poné la IP de esa Mac en la misma red (por ejemplo <b className="text-fore">http://192.168.100.20:17890</b>): así todas imprimen por el puente.</p>
        <FormField label="Destino" htmlFor="impresora-destino">
          <Input id="impresora-destino" list="impresoras-detectadas" value={config.impresora} onChange={event => setConfig(actual => ({ ...actual, impresora: event.target.value }))} placeholder="lan:192.168.1.23:9100" autoCapitalize="off" spellCheck={false} />
        </FormField>
        <datalist id="impresoras-detectadas">
          {lan.map(destino => <option key={destino} value={destino} />)}
          {usb.map(cola => <option key={cola} value={`usb:${cola}`} />)}
        </datalist>
        <div className="grid gap-3 sm:grid-cols-3">
          <FormField label="Ancho" htmlFor="impresora-ancho">
            <Select id="impresora-ancho" value={String(config.ancho)} onChange={event => setConfig(actual => ({ ...actual, ancho: Number(event.target.value) }))}>
              <option value="80">80 mm (predeterminado)</option>
              <option value="58">58 mm</option>
            </Select>
          </FormField>
          <FormField label="Copias" htmlFor="impresora-copias">
            <Input id="impresora-copias" inputMode="numeric" maxLength={1} value={String(config.copias)} onChange={event => setConfig(actual => ({ ...actual, copias: event.target.value.replace(/\D/g, '').slice(0, 1) || '1' }))} />
          </FormField>
          <FormField label="Token del agente" htmlFor="impresora-token">
            <Input id="impresora-token" value={config.token} onChange={event => setConfig(actual => ({ ...actual, token: event.target.value }))} placeholder="Lo muestra el instalador" />
          </FormField>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={guardar}>Guardar impresora</Button>
          <Button type="button" variant="outline" onClick={probar} disabled={probando || !config.impresora.trim()}>{probando ? 'Enviando…' : 'Imprimir prueba'}</Button>
        </div>
        <p className="text-xs text-mute">La prueba manda texto con acentos, negrita, doble alto, QR y código de barras, con padding a los costados y corte automático al final. Si sale todo, la impresora quedó lista; el A4 sigue imprimiéndose por el diálogo normal.</p>
      </Card>
    </div>
  )
}
