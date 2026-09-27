# #271 · Foto vieja: verificación en todas las superficies

## Qué se verifica
- **Superficies** (spec `e2e/qa-271-avatar-superficies.spec.js`): shell (chip de usuario y píldora), Mi cuenta, Equipo y acceso, Clientes y Pedidos. El **bloqueo** tiene su propio spec (`qa-271-avatar-sin-flash.spec.js`).
- **Trampa realista**: `/api/auth/me` sirve una «foto de Google» vieja (`ownerProfile.picture`) y el contexto del dispositivo una foto guardada; **todas** las descargas de avatar (`/api/users/*/avatar`) quedan bloqueadas por una compuerta por superficie.
- **Invariante**: mientras el avatar no resuelve, **ninguna** foto pintada en la página (`img[alt^="Foto de"]` = 0): placeholder neutro (iniciales). Al liberar, la foto actual aparece donde está garantizada (shell y Mi cuenta) y las descargas drenan en listas/cronologías.
- **Prueba negativa**: con el `Avatar` de `main` (sin `avatarFuente`) el spec **falla** (la foto vieja se pinta durante la resolución); con el fix pasa. Verificado el 27/09.

## Evidencia
- `superficie-<shell|mi-cuenta|equipo|clientes|pedidos>-sin-foto.jpg` (durante la resolución) y `-con-foto.jpg` (donde aplica).
- Cambio/borrado de foto y recarga del bloqueo: `cambio-de-foto.jpg`, `sin-foto.jpg`, `bloqueo-reload-en-curso.jpg`, `bloqueo-reload-resuelto.jpg`.
- Videos: `reload-sin-flash.webm` (con el fix) y `reload-con-flash-antes.webm` (comportamiento anterior).
- Unit: `src/lib/avatarFuente.test.js` (4) y `src/lib/sesionPerfil.test.js` (3) fijan el orden y la precedencia del perfil.
