import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { error, json } from '../../../../lib/http'
import { urlDeInstalacion } from '../../../../lib/print-agent-install'

// Manifest público del instalador del agente: lo genera el packer dentro de
// public/print-agent. Sin artefacto publicado responde 503 para que la UI
// ofrezca la instalación desde el repo.
//
// La URL publicada sale de `lib/print-agent-install` (override propio →
// MOBOS_API_URL → X-Forwarded-* confiable → origen del request): detrás del
// proxy el `request.url` es el origen interno y no sirve (bug de producción de
// #17/#185). `MOBOS_APP_URL` es la app: ahí el path no existe (nginx devuelve la
// SPA) y el `curl | bash` muere con HTML.
export async function GET(request: Request) {
  try {
    const crudo = await readFile(join(process.cwd(), 'public', 'print-agent', 'manifest.json'), 'utf8')
    const manifest = JSON.parse(crudo) as Record<string, unknown>
    const version = typeof manifest.version === 'string' ? manifest.version : ''
    const file = typeof manifest.file === 'string' ? manifest.file : ''
    const sha256 = typeof manifest.sha256 === 'string' ? manifest.sha256 : ''
    const size = Number(manifest.size)
    if (!version || !file || !/^[a-f0-9]{64}$/i.test(sha256) || !Number.isFinite(size) || size <= 0) return error('El instalador del agente no está publicado.', 503)
    return json({ version, file, sha256, size, installUrl: urlDeInstalacion(request) })
  } catch {
    return error('El instalador del agente no está publicado.', 503)
  }
}
