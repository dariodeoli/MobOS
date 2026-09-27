# Verificación visual de #271 (foto anterior) y #277 (plantilla) + #256 secundarias

Revisión de diseño/QA visual de tres pedidos, con capturas en claro, oscuro y
móvil. Todo lo propio quedó en esta rama (`slot/diseno`); lo de #271 es revisión
de la evidencia de PLT porque su fix **todavía no está integrado en `main`**.

## #271 · La foto anterior al recargar (PLT, `slot/plataforma`)

**Causa (confirmada en el código de `main`, pre-fix):** `Avatar` pintaba la foto
de Google/`picture` **mientras** la foto local resolvía. En una recarga, el
perfil guardado del dispositivo entra antes que `/api/auth/me` y el avatar
local → se ve «la foto anterior» en todas las pantallas, incluido el bloqueo.

**Verificación «antes» (mía, reproducible):** `scripts/qa-271-avatar-antes.mjs`
sube una foto real (QR negro), inyecta una **foto vieja** (QR distinto) en
`owncoding_hub_company_context`, demora el avatar 1500 ms y recarga el bloqueo.
Comparación **exacta** del `src` pintado contra cada data URL:

| Tema | Durante la ventana | Al resolver |
|---|---|---|
| Claro | **VIEJA** ✗ | correcta ✓ |
| Oscuro | **VIEJA** ✗ | correcta ✓ |
| Móvil | **VIEJA** ✗ | correcta ✓ |

Evidencia: `docs/qa/271-avatar-sin-flash/dsn-antes/` (3+3 capturas + `resultado.json`).
La captura `bloqueo-en-curso-claro.jpg` muestra la foto vieja junto a
«Administrador» en la pantalla de bloqueo.

**Fix de PLT (revisado, `566407eb` + `b4051d3c` + `40bc1f17`):**
- `Avatar` guarda la foto local **con su dueño** (`{ id, url }`) y no la pinta
  para otro usuario; mientras resuelve muestra **placeholder neutro**
  (iniciales) y **no adelanta** la de Google (`src/lib/avatarFuente.js`).
- `getAvatarDataUrl` descarga con `cache: 'no-cache'` (revalida el ETag).
- `combinarPerfil` (sesión) ahora es puro y el servidor manda: la copia del
  dispositivo solo cubre cuando `/me` **falla**.
- Evidencia de PLT: e2e `qa-271-avatar-sin-flash` 2/2 y capturas en su rama.

**Verificación «después» (mía, con el fix aplicado localmente):** apliqué el
parche de runtime de PLT (`Avatar.jsx`, `userAvatar.js`, `sesion.jsx`,
`avatarFuente.js`, `sesionPerfil.js`, ruta del avatar) **sin commitear**, corrí
el mismo script y después **revertí** el árbol (queda limpio). Resultado en
claro, oscuro y móvil: **`fotoViejaPintada: false` (0/3)** — el bloqueo muestra
las iniciales neutras durante la ventana y la foto correcta al resolver.
Capturas: `docs/qa/271-avatar-sin-flash/dsn-despues/`.

**Veredicto:** el bug es real y está reproducido; el fix de PLT resuelve el
comportamiento esperado, verificado en los tres temas con el parche aplicado
localmente. **Pendiente de integración**: cuando entre, se re-verifica en la
rama/producción con el mismo script (esperado 0/3 igual que en la simulación).

**Lámina de cierre:** `docs/qa/271-avatar-sin-flash/comparativa-cierre.jpg`
(matriz claro/oscuro/móvil × ANTES/DESPUÉS), generada con
`scripts/qa-comparativas-cierre.mjs`.

**Nota para CMP/PLT:** `docs/AVATAR.md` mantiene «subida → Google → iniciales»
(no cambia), pero conviene sumar la nuance al integrar: *mientras la subida
resuelve, placeholder neutro; Google entra recién cuando la local se descartó*.

## #277 · Editor de la plantilla del ticket de prueba (entrega propia)

Verificación visual ya entregada con capturas antes/después:

- `docs/qa/plantilla-prueba/{antes,despues}/`: claro, oscuro, móvil, la acción
  (58 mm + sin corte + 2 copias), el ticket completo y las acciones de la ficha
  (Imprimir prueba / Editar / Plantilla). Producción v1.0.190: **0/3 con
  editor**; rama: **3/3** sin desborde en móvil.
- Cierre: `docs/QA-PLANTILLA-PRUEBA.md`; e2e `impresion-plantilla` (corto por
  defecto, guardado en la impresora y reapertura) + unitarios + `db:check`.

**Veredicto:** el ticket corto, el completo, el ancho 58/80, los cortes, las
copias y el guardado quedan verificados visual y funcionalmente.

## #256 · Páginas secundarias y Configuración (entrega propia)

Capturas existentes y vigentes (los cambios son de la barra compacta):

- `docs/qa/paginas-secundarias/{antes,despues}/` — 22 tomas por lado
  (claro/oscuro desktop + claro móvil de Productos, Pedidos, Promociones,
  Cotizaciones, Plantillas y Delivery; antes 0/7 con barra, después 6/7
  visibles — la séptima es el pipeline del dueño).
- `docs/qa/253-config-nav/revision-contenido/` — 22 tomas de los 7 grupos con
  contenido cargado (sin esqueletos), sin desbordes, con el arreglo de la ficha
  del integrante (`FilaDato`).
- Cierres: `docs/QA-256-composicion.md` (incluye Pedidos y la revisión de
  Configuración).

**Veredicto:** composición compacta y Configuración quedan parejas entre
pantallas; sin desbordes en 390/1280.

## Cómo re-verificar #271

```sh
# 1. Backend+frontend e2e (base y puertos del worktree)
MOBOS_E2E_DB=mobos_e2e_MOS_DSN MOBOS_E2E_PGDATA=/tmp/mobos-e2e-pg-MOS-DSN \
MOBOS_E2E_PGPORT=5503 MOBOS_E2E_API_PORT=3103 MOBOS_E2E_WEB_PORT=5203 \
bash e2e/bin/start-backend.sh &
MOBOS_E2E_DB=mobos_e2e_MOS_DSN MOBOS_E2E_API_PORT=3103 MOBOS_E2E_WEB_PORT=5203 \
bash e2e/bin/start-frontend.sh &
# 2. Verificación visual
QA_BASE_URL=http://localhost:5203 node scripts/qa-271-avatar-antes.mjs
```

Esperado **con el fix**: `fotoViejaPintada: false` en claro, oscuro y móvil (el
bloqueo muestra iniciales hasta resolver). El script limpia la foto de prueba al
terminar; deja las capturas en `docs/qa/271-avatar-sin-flash/dsn-antes/`.
