// Orden visible del avatar (#211/#271), puro y testeable: la foto local **de
// este usuario** manda; la de Google entra recién cuando la local ya se
// descartó (o no puede existir) — nunca antes, para no adelantar una foto
// vieja mientras resuelve; sin nada, iniciales. Si la de Google falla, se cae a
// iniciales en vez de dejar una imagen rota (#164).
export function fuenteAvatar({ foto = null, usuarioId = '', localListo = false, picture = '', googleRota = false } = {}) {
  if (foto && foto.id && foto.id === usuarioId) return { tipo: 'foto', src: foto.url }
  if (picture && !googleRota && localListo) return { tipo: 'google', src: picture }
  return { tipo: 'iniciales', src: '' }
}
