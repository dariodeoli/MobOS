
// Nonce de un solo uso emitido por el servidor (POST /api/auth/nonce, vence a los
// 5 min). Se pide justo antes de abrir la hoja de Apple/Google y se manda de vuelta
// al API junto con el token. `purpose`: 'login' (por defecto) o 'reauth' (borrar cuenta).
export async function pedirNonce(purpose = 'login') {
  const { api } = await import('../api/client.js')
  const respuesta = await api.post('/api/auth/nonce', { purpose })
  const nonce = respuesta?.nonce
  if (typeof nonce !== 'string' || !/^[a-f0-9]{64}$/.test(nonce)) throw new Error('No se pudo iniciar el acceso seguro. Probá de nuevo.')
  return nonce
}
