# #248 · Raíz sin sesión → /login — verificación

El pedido: sin sesión, la raíz de `app.moboss.online` debe ir a **/login** (con
vuelta post-login); **/demo** queda solo por entrada explícita y los enlaces
públicos no piden sesión.

## e2e local (harness, mismo código del repo)

`npx playwright test e2e/redireccion-248.spec.js` → **4/4 passed**:

1. sin sesión la raíz va a /login y no a /demo;
2. una ruta protegida pide login y al entrar vuelve al destino
   (`/login?volver=%2Fclientes` → `/clientes`);
3. `/demo` sigue disponible solo por entrada explícita;
4. los enlaces públicos (`/u/<serial>`) siguen abiertos sin sesión.

## Producción (v1.0.175) — re-verificado

`node scripts/qa-248-produccion.mjs` con `QA_OUT=produccion-v1.0.175` → **5/5
pasos OK** en `v1.0.175`: raíz → `/login` (no `/demo`), ruta protegida con
`?volver`, `/demo` por entrada explícita, informe público sin login y bundle
`index-DKn00FhB.js` (214 KB). Evidencia:
[`produccion-v1.0.175/resultados.json`](produccion-v1.0.175/resultados.json)
+ capturas.

## Producción (v1.0.168)

`node scripts/qa-248-produccion.mjs` con `QA_OUT=reverificacion-v1.0.168`
→ **5/5 pasos OK**:

- raíz → `/login` (no `/demo`), con la versión desplegada visible;
- `/inventario/unidades` → `/login?volver=%2Finventario%2Funidades`;
- `/demo` abre con los perfiles (entrada explícita);
- `/u/<serial>` no redirige al login;
- bundle desplegado: `index-DABCgpsU.js` (**173 KB**).

Notas de honestidad: los 401 de `/api/auth/me` son la sesión ausente (esperado
sin login) y el 404 de `/api/public/units/<serial>` es el serial de muestra,
que no existe en la base de producción; el paso solo exige que la página
pública no pida sesión.

**Evidencia:** [`reverificacion-v1.0.168/resultados.json`](reverificacion-v1.0.168/resultados.json)
+ capturas `01-raiz-login` … `04-informe-publico`. La línea base histórica
(entry 1104 KB de v1.0.152) queda en [`produccion/resultados.json`](produccion/resultados.json).
