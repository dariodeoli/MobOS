import { useCallback, useEffect, useState } from 'react'
import { Aviso, Badge, Button, Card, ConfirmDialog, Skeleton } from '@/components/ui'
import Icon from '@/components/shared/Icon'
import { api } from '@/lib/api/client'
import { useSesion } from '@/lib/sesion'
import { fechaHora } from '@/utils/fecha'
import { copiarAlPortapapeles } from '@/utils/portapapeles'
import { GRILLA_DOS_COLUMNAS } from '@/components/shared/formulario'

const PROVIDERS = [
  { id: 'chatgpt', name: 'ChatGPT', description: 'Consultá tu empresa desde ChatGPT mediante MCP.' },
  { id: 'claude', name: 'Claude', description: 'Conectá Claude con las funciones autorizadas de MobOS.' },
]

function scopesText(scopes) {
  if (!Array.isArray(scopes) || scopes.length === 0) return 'Sin capacidades registradas'
  const labels = { 'company:read': 'Empresa', 'products:read': 'Productos', 'products:write': 'Editar productos', 'customers:read': 'Clientes', 'customers:write': 'Editar clientes', 'sales:read': 'Ventas', 'reports:read': 'Reportes' }
  return scopes.map(item => {
    const scope = typeof item === 'string' ? item : item && typeof item.scope === 'string' ? item.scope : ''
    if (!scope) return typeof item?.label === 'string' ? item.label : null
    return typeof item?.label === 'string' && item.label.trim() ? item.label : (labels[scope] || scope.replace(/[:_]/g, ' '))
  }).filter(Boolean).join(' · ') || 'Sin capacidades registradas'
}

function providerName(clientId) {
  const known = PROVIDERS.find(item => item.id === String(clientId || '').toLowerCase())
  return known?.name || clientId || 'Cliente MCP'
}

export default function McpConexiones() {
  const { esDemo } = useSesion()
  const [connections, setConnections] = useState([])
  const [oauthReady, setOauthReady] = useState(false)
  const [endpoint, setEndpoint] = useState('')
  const [capabilities, setCapabilities] = useState([])
  const [providerStatuses, setProviderStatuses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    if (esDemo) {
      setConnections([])
      setOauthReady(false)
      setEndpoint('')
      setCapabilities([])
      setProviderStatuses([])
      setLoading(false)
      return
    }
    try {
      const data = await api.get('/api/mcp/connections')
      setConnections(Array.isArray(data?.connections) ? data.connections : [])
      // The API must explicitly confirm OAuth registration before the UI can
      // advertise an enabled connection action. Absence is fail-closed.
      setOauthReady(data?.oauthConfigured === true)
      setEndpoint(typeof data?.endpoint === 'string' ? data.endpoint : '')
      setCapabilities(Array.isArray(data?.capabilities) ? data.capabilities : [])
      setProviderStatuses(Array.isArray(data?.providers) ? data.providers : [])
    } catch (cause) {
      setError(cause?.message || 'No se pudieron cargar las conexiones MCP.')
      setConnections([])
      setOauthReady(false)
      setEndpoint('')
      setCapabilities([])
    } finally { setLoading(false) }
  }, [esDemo])

  useEffect(() => { load() }, [load])

  async function revoke(connection) {
    if (!connection?.id || busy) return
    setBusy(true)
    setError('')
    try {
      await api.delete('/api/mcp/connections', { body: { id: connection.id } })
      setConnections(current => current.filter(item => item.id !== connection.id))
    } catch (cause) {
      setError(cause?.message || 'No se pudo revocar la conexión.')
    } finally {
      setBusy(false)
      setConfirm(null)
    }
  }

  function providerConfigured(id) {
    const explicit = providerStatuses.find(item => String(item?.id || item?.provider || '').toLowerCase() === id)
    // Provider readiness is intentionally fail-closed. A global OAuth flag or
    // another provider's registration must never make this provider appear
    // connected before its own client/redirect configuration is present.
    return Boolean(explicit && (explicit.configured === true || explicit.oauth === true))
  }

  function providerClientId(id) {
    const explicit = providerStatuses.find(item => String(item?.id || item?.provider || '').toLowerCase() === id)
    return typeof explicit?.id === 'string' ? explicit.id : ''
  }

  return (
    <div className="space-y-4" data-testid="mcp-conexiones">
      <Card className="space-y-4" data-testid="mcp-conexiones-resumen">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-fono/10 text-fono-light"><Icon name="plug" className="h-5 w-5" aria-hidden="true" /></span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">Conexiones IA y MCP</h2><Badge color={oauthReady ? 'green' : 'orange'}>{oauthReady ? 'Disponible' : 'Pendiente'}</Badge></div>
              <p className="mt-1 max-w-2xl text-sm text-mute">Conectá ChatGPT o Claude con los datos y acciones que tu usuario ya tiene permitidos en MobOS.</p>
            </div>
          </div>
          <Button type="button" variant="outline" onClick={load} disabled={loading}><Icon name="refresh" className="h-3.5 w-3.5" />Actualizar</Button>
        </div>

        {esDemo && <Aviso tono="warn" como="div">La demo muestra el estado de forma ilustrativa. Las conexiones reales se habilitan únicamente desde una empresa autenticada.</Aviso>}
        {!esDemo && !loading && !error && !oauthReady && <Aviso tono="warn" como="div" data-testid="mcp-oauth-pendiente"><b>OAuth todavía no está configurado.</b> La conexión queda pendiente y no se muestra como habilitada hasta registrar el cliente y sus redirect URIs HTTPS.</Aviso>}
        {!esDemo && !loading && error && <Aviso tono="warn" como="div" data-testid="mcp-oauth-no-verificado">No pudimos verificar la configuración OAuth. Las acciones de conexión permanecen deshabilitadas.</Aviso>}
        {error && <Aviso tono="error" role="alert">{error}</Aviso>}

        <div className={GRILLA_DOS_COLUMNAS}>
          {PROVIDERS.map(provider => (
            <div key={provider.id} className="flex min-h-28 flex-col justify-between rounded-xl border border-ink-600 bg-ink-700/30 p-3" data-testid={`mcp-proveedor-${provider.id}`}>
              <div><div className="flex items-center justify-between gap-2"><p className="min-w-0 break-words font-medium">{provider.name}</p><Badge color="slate">MCP</Badge></div><p className="mt-1 text-xs text-mute">{provider.description}</p></div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge color={providerConfigured(provider.id) ? 'green' : 'orange'}>{providerConfigured(provider.id) ? 'Configurado' : 'Pendiente'}</Badge>
                {!providerConfigured(provider.id) && <span className="text-xs font-medium text-mute">Requiere OAuth registrado</span>}
                {providerClientId(provider.id) && <span className="flex min-w-0 items-center gap-2 text-xs text-mute" data-testid={`mcp-client-id-${provider.id}`}><span className="max-w-48 break-all">ID: {providerClientId(provider.id)}</span><Button type="button" variant="ghost" className="min-h-9 px-2 text-xs" onClick={() => copiarAlPortapapeles(providerClientId(provider.id))}>Copiar ID</Button></span>}
              </div>
            </div>
          ))}
        </div>
        {oauthReady && capabilities.length > 0 && <div className="rounded-xl border border-ink-600 p-3" data-testid="mcp-capacidades"><p className="text-xs font-semibold uppercase tracking-wide text-mute">Capacidades disponibles</p><p className="mt-1 text-sm text-mute">{scopesText(capabilities)}</p></div>}
        {endpoint && <div className="flex flex-wrap items-center gap-2 rounded-xl border border-ink-600 p-3" data-testid="mcp-endpoint"><span className="min-w-0 flex-1 break-all text-xs text-mute">Endpoint MCP: {endpoint}</span><Button type="button" variant="outline" onClick={() => copiarAlPortapapeles(endpoint)}>Copiar endpoint</Button></div>}
      </Card>

      <Card className="space-y-3" data-testid="mcp-conexiones-lista">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-semibold">Conexiones autorizadas</h2><p className="mt-0.5 text-sm text-mute">Cada conexión queda limitada por usuario, empresa, sucursal, módulos y permisos vigentes.</p></div><Badge color="slate">{connections.length} {connections.length === 1 ? 'conexión' : 'conexiones'}</Badge></div>
        {loading ? <Skeleton className="h-20 w-full" /> : connections.length === 0 ? <div className="rounded-xl border border-dashed border-ink-600 p-5 text-center text-sm text-mute">Todavía no hay conexiones autorizadas.</div> : <div className="divide-y divide-ink-600 rounded-xl border border-ink-600">{connections.map(connection => <div key={connection.id} className="flex flex-wrap items-start justify-between gap-3 p-3" data-testid="mcp-conexion-fila"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><Icon name="shield" className="h-4 w-4 text-ok" aria-hidden="true" /><p className="font-medium">{providerName(connection.clientId)}</p><Badge color={connection.revokedAt ? 'slate' : 'green'}>{connection.revokedAt ? 'Revocada' : 'Activa'}</Badge></div><p className="mt-1 break-words text-xs text-mute">Capacidades: {scopesText(connection.scopes)}</p><p className="mt-1 text-xs text-mute">Última actividad: {connection.lastUsedAt ? fechaHora(connection.lastUsedAt) : 'Sin actividad registrada'}</p></div>{!connection.revokedAt && <Button type="button" variant="outline" className="text-bad" onClick={() => setConfirm(connection)} disabled={busy}>Revocar</Button>}</div>)}</div>}
      </Card>

      <Card className="space-y-2" data-testid="mcp-guia">
        <div className="flex items-start gap-3"><Icon name="book" className="mt-0.5 h-5 w-5 shrink-0 text-mute" aria-hidden="true" /><div><h2 className="font-semibold">Guía de conexión</h2><p className="mt-1 text-sm text-mute">Copiá la dirección, agregala como conector en ChatGPT o Claude y autorizá tu empresa.</p><div className="mt-3 flex flex-wrap gap-2"><a className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-ink-600 px-3 text-sm font-medium hover:bg-ink-700" href="https://help.openai.com/en/articles/12584461-developer-mode-and-full-mcp-connectors-in-chatgpt" target="_blank" rel="noreferrer">Guía de ChatGPT <Icon name="external" className="h-3.5 w-3.5" /></a><a className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-ink-600 px-3 text-sm font-medium hover:bg-ink-700" href="https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp" target="_blank" rel="noreferrer">Guía de Claude <Icon name="external" className="h-3.5 w-3.5" /></a></div></div></div>
      </Card>

      <ConfirmDialog open={Boolean(confirm)} onCancel={() => setConfirm(null)} onConfirm={() => revoke(confirm)} title="¿Revocar esta conexión?" description="El proveedor perderá acceso inmediatamente. Los permisos de MobOS y la auditoría se mantienen." confirmLabel="Revocar conexión" variant="danger" busy={busy} />
    </div>
  )
}
