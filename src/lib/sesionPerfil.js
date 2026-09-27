// Perfil del dueño para el shell (#271): la respuesta fresca de /api/auth/me
// manda. La copia del contexto guardado en el dispositivo es solo un respaldo
// para cuando el servidor **no respondió** (por ejemplo, `me()` falló) — si
// respondió sin nombre ni foto, mostrarla sería enseñar una foto vieja.
export function combinarPerfil(ownerProfile, almacenado = null) {
  if (ownerProfile === undefined) return almacenado || null
  if (ownerProfile && (ownerProfile.name || ownerProfile.picture)) return ownerProfile
  return null
}
