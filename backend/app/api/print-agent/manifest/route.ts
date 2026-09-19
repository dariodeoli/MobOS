import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { error, json } from '../../../../lib/http'

// Manifest público del instalador del agente: lo genera el packer dentro de
// public/print-agent. Sin artefacto publicado responde 503 para que la UI
// ofrezca la instalación desde el repo.
function baseDeInstalacion(request: Request) {
  const configurada = process.env.MOBOS_APP_URL?.trim().replace(/\/+$/, '')
  return configurada || new URL(request.url).origin
}

export async function GET(request: Request) {
  try {
    const crudo = await readFile(join(process.cwd(), 'public', 'print-agent', 'manifest.json'), 'utf8')
    const manifest = JSON.parse(crudo) as Record<string, unknown>
    const version = typeof manifest.version === 'string' ? manifest.version : ''
    const file = typeof manifest.file === 'string' ? manifest.file : ''
    const sha256 = typeof manifest.sha256 === 'string' ? manifest.sha256 : ''
    const size = Number(manifest.size)
    if (!version || !file || !/^[a-f0-9]{64}$/i.test(sha256) || !Number.isFinite(size) || size <= 0) return error('El instalador del agente no está publicado.', 503)
    return json({ version, file, sha256, size, installUrl: `${baseDeInstalacion(request)}/print-agent/install.sh` })
  } catch {
    return error('El instalador del agente no está publicado.', 503)
  }
}
