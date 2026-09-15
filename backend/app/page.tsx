import { MOBOS_IDENTITY } from '../lib/identity'

export default function HomePage() {
  return (
    <main style={{ maxWidth: 720, margin: '64px auto', padding: '0 24px', fontFamily: 'system-ui, sans-serif', lineHeight: 1.5 }}>
      <img src={MOBOS_IDENTITY.faviconPath} width="64" height="64" alt="" />
      <h1>{MOBOS_IDENTITY.apiName}</h1>
      <p>{MOBOS_IDENTITY.description}</p>
      <p>
        <a href="/api/health">Estado del servicio</a>
        {' · '}
        <a href={MOBOS_IDENTITY.urls.app}>Abrir MobOS</a>
      </p>
    </main>
  )
}
