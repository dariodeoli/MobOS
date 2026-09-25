# Config → **Seguro y límites**: «No guarda» (bug/UX)

Ronda del slot/finanzas (2026-09-24). Pedido del dueño: el seguro (25%) y los
límites **no persistían**; al apretar **Enter** debía guardar solo (sin depender
del botón «Guardar seguro»); y la sección pedía un rediseño v2 agrupado con
estado **Guardado/Error**.

## Causa raíz

Tres problemas concretos, todos en la pantalla:

1. **Enter no guardaba nada**: los campos no estaban dentro de un `<form>` — el
   botón era `type="button"` con `onClick`. Apretar Enter (el gesto natural
   después de escribir 25) no hacía nada y no había ningún aviso: «no guarda».
2. **Guardar un grupo pisaba lo editado en el otro**: el formulario se hidrataba
   con un `useEffect` sobre `account`, y cada guardado hace `setAccount(...)`.
   Resultado: guardar el seguro reescribía los límites con los valores viejos
   del servidor (y al revés). Lo tipeado desaparecía.
3. **En la cuenta real el API exige reautenticación reciente** (10 minutos) para
   las acciones sensibles — `PATCH /api/account` la pide para *todas*, seguro y
   límites incluidos. Sin esa ventana, el guardado devolvía 403
   («Reautenticá tu contraseña para continuar.») y el mensaje quedaba en el
   aviso global del tope de la pantalla, lejos de la sección: el usuario veía
   que el número volvía a lo anterior.

En la **demo** el problema era 1 y 2 (no hay API ni reautenticación); en la
cuenta real se sumaba 3.

## Qué se hizo

- **Dos grupos con form propio** (`Seguro de ventas` y `Montos y porcentajes`):
  Enter guarda (submit) y los botones siguen funcionando como submit.
- **Estado por grupo** (`aria-live`): chip verde «Guardado…» o el error en rojo
  dentro del grupo que falló, con validación previa del lado del cliente
  (mismos límites que el backend; el seguro avisa que se guarda sin decimales).
- **Reautenticación en el lugar**: si el API pide la contraseña, el grupo muestra
  «Confirmá tu contraseña para guardar» con el campo de contraseña; al
  verificarla, **el guardado sigue solo** (los cambios del usuario no se
  pierden) y la autorización queda habilitada 10 minutos.
- **La hidratación del formulario corre solo al cargar la cuenta**: los guardados
  parciales ya no pisan lo editado en el otro grupo.
- Rediseño v2: sección «Seguro y límites» agrupada, con superficies `v2-tile` y
  el resumen «Actual:» dentro del grupo de límites.

## Evidencia

| Qué | Dónde |
| --- | --- |
| Antes (bug): Enter en el seguro — sin `form`, sin estado, el valor no se guarda | `seguro-limites-seguro-enter-antes.png` |
| Antes: error de límites en el aviso global (fuera de la sección) | `seguro-limites-limites-error-antes.png` |
| Después: el grupo pide la contraseña y reintenta solo | `seguro-limites-reauth-despues.png` |
| Después: seguro guardado con Enter y persistido tras recargar | `seguro-limites-seguro-enter-despues.png` |
| Después: límites con chip «Guardado.» | `seguro-limites-limites-enter-despues.png` |
| Después: valor inválido explicado en el grupo (no se guarda) | `seguro-limites-limites-error-despues.png` |

Spec: `e2e/config-seguro-limites.spec.js` (5 casos, incluye la limpieza de los
valores de la tienda que comparte la suite). Unit: `src/utils/limitesEmpresa.test.js`
(3 casos). El reparto de shards se regeneró (`e2e/sharding.json`).

Los casos cubren: guardar con Enter + persistencia tras recargar, guardar un
grupo sin pisar el otro, valor inválido con estado de error (y sin llamar al
API), reautenticación con reintento automático y la restauración final.

## Coordinación (fuera del dominio)

- `backend/app/api/auth/me/route.ts` devuelve el tenant sin `insurancePct`,
  `loyaltyPct` ni `collectionLateFeeBpPerDay` (sí devuelve los límites de gasto,
  compra y bajo lista). Hoy ninguna pantalla los lee de ahí —la sección usa
  `GET /api/account`, que sí los trae— pero la inconsistencia queda para PLT.
- La puerta de reautenticación del `PATCH /api/account` (acción de PLT) se
  mantiene tal cual: la UI ahora la resuelve en el lugar en vez de fallar.
