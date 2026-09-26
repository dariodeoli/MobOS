# #219 · Usuarios demo con foto de perfil (cierre del pendiente)

Era el último punto del tracker **#219**: *«Usuarios demo con foto de perfil
aleatoria, nombre ficticio, email que empiece con 35 y sin la palabra demo»*.
Nombre y correo ya estaban; faltaba la foto.

## Qué entró

- **Retratos ficticios locales** (`src/lib/demo/avatares.js`): set de retratos
  ilustrados embebidos como data URI SVG, repartidos de forma **determinista por
  id** (`avatarDemo`). Sin llamadas externas y sin guardar nada: la demo sigue
  siendo session-only (#201).
- **`userAvatar.js`** resuelve la foto del equipo demo sin pegarle al API (#192):
  antes devolvía vacío en demo; ahora usa el retrato ficticio.
- **Equipo y acceso** muestra la foto de cada integrante demo (se quitó el
  `hasAvatar: false` que forzaba iniciales) y las firmas de verificación usan la
  misma foto.
- **Dos arreglos de consistencia de la demo** que aparecieron al verificar:
  - `getVendedores()` siembra el equipo demo cuando la lista está vacía: una
    carga directa de Equipo ya no quedaba sin integrantes (antes solo dependía
    del seed posterior al ingreso).
  - La demo espeja `lastVerifiedAt` (forma real) además de `verifiedAt`: la
    fila y la ficha muestran «Verificado por …» tras firmar, como en la cuenta
    real.

## Verificación

- `npm test` **758 ✓** (nuevos: `demo/avatares.test.js` y la aserción de
  `lastVerifiedAt` en `demoInventory.test.js`).
- **e2e** `demo-anonimo` (core): caso nuevo «el equipo demo muestra fotos de
  perfil ficticias» — ≥4 integrantes con `img[alt^="Foto de"]` en Equipo, todas
  `data:image/svg+xml` (ningún servicio externo), y la firma de la verificación
  física en la ficha. Capturas en `docs/qa/219-demo-fotos/`.
- `inventario-unidades` (admin) **20/20** sin regresiones.
- La suite `demo-anonimo` completa sigue verde (recorrido de módulos, barrido de
  storage y sin llamadas al API).

## Pendiente de deploy

Producción v1.0.175 todavía muestra iniciales en el equipo demo: este cambio
viaja en `slot/inventario` y se evidencia con `node e2e/prod/…` una vez
desplegado (el resto de #219 ya está verificado en producción, ver
`docs/QA-219-215-CIERRE.md`).

## Novedades para el dueño

- El **equipo de la demo** ahora tiene **fotos de perfil** (retratos ficticios):
  se ve en Integrantes y en las firmas de verificación del inventario.
- Son fotos de mentira guardadas en el navegador: no se piden a ningún servicio
  ni se guardan datos reales; al recargar, la demo vuelve a su estado inicial.
- De paso, la pantalla de **Equipo** de la demo ya no queda en blanco si se
  entra directo, y la ficha del equipo muestra quién verificó cuando el usuario
  demo firma.
