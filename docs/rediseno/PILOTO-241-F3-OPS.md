# Paquete de aprobación · F3 “Tablero ops” (vista previa + tablero real)

Addendum al paquete del piloto (`docs/rediseno/PILOTO-241.md`, DSN): suma el
**tablero de operaciones** del mock F3 con los **tokens v2** ya definidos para
las pantallas piloto. La vista previa (`/ops-preview`) sigue siendo un **mock
sin API**; el **tablero real** (mismos tokens y estructura, con datos de la
empresa) ya está construido **detrás del flag `VITE_OPS_V2=1`** y no se activa
en ningún entorno sin esa variable.

## 1. Qué muestra

- **KPIs del día**: ingresos, pedidos, equipos en taller y certificados, con
  números grandes (`v2-numero`, tabular) sobre los tokens v2.
- **Equipos en proceso (vista rack)**: tiles con modelo, **IMEI en mono**, chips
  de estado (certificado / por verificar / diagnóstico / listo), grado y
  batería cuando existen.
- **Colas de trabajo**: *Up next / Queued / Ready* (patrón PhoneCheck) para el
  día del taller/ingreso.
- Banner **“Propuesta F3 · no activada”** y pie con datos ficticios.

## 2. Capturas

Claro, oscuro y móvil (390):

| Vista | Captura |
| --- | --- |
| Claro | [`preview-claro.jpg`](../qa/241-ops-preview/preview-claro.jpg) |
| Oscuro (consola) | [`preview-oscuro.jpg`](../qa/241-ops-preview/preview-oscuro.jpg) |
| Móvil | [`preview-movil.jpg`](../qa/241-ops-preview/preview-movil.jpg) |

## 3. Infraestructura de F3 (lista, apagada)

La lógica vive en `src/lib/flags.js` (probada en `flags.test.js`):

| Ruta / flag | Cuándo responde | Datos |
| --- | --- | --- |
| `/ops-preview` | desarrollo, `VITE_OPS_PREVIEW=1` o `VITE_OPS_V2=1` | ficticios (mock) |
| `/ops` (ruta real) | solo con `VITE_OPS_V2=1` | **reales** de la empresa |
| Menú | **sin entrada** hasta la aprobación | — |

- **Revisar la vista previa**: `npm run dev` → `http://localhost:5173/ops-preview`.
- **Activarla en un entorno**: cargar `VITE_OPS_V2=1` como variable de build en
  Coolify (frontend) → redeploy. Recién entonces `/ops` responde; agregar la
  entrada al menú es el paso siguiente de la fase aprobada.
- El mock del preview **no llama al API** (e2e lo verifica). El tablero real:

| Bloque | Fuente real |
| --- | --- |
| Cobrado hoy / Pedidos hoy | `/api/orders` (pagos acreditados de hoy y pedidos creados hoy) |
| En taller / Listos para vender | `/api/inventory-units` con el rack de #240 (por verificar → verificado → listo) |
| Equipos en proceso y colas | el mismo rack, con grado y batería de la inspección |
| Actualización | al abrir, cada minuto con la pestaña visible, o con «Actualizar» |

En la demo solo se lee el inventario de práctica (los pedidos reales quedan
fuera con un aviso en el tablero). Capturas del tablero real:
[`docs/qa/241-ops-tablero/`](../qa/241-ops-tablero/) (claro, oscuro y móvil).
Verificación e2e con datos reales (base y API del harness sembrado, incluida
una unidad recibida desde la UI que el tablero cuenta):
[`docs/QA-240-241-taller-f3-e2e.md`](../QA-240-241-taller-f3-e2e.md).

## 4. Estado de la construcción del F3 real (post-aprobación)

1. **Datos** ✅: KPIs desde pedidos e inventario, equipos desde el rack de #240 y
   colas del taller (por verificar / verificado / listo). Con el flag apagado
   nada de esto corre en producción.
2. **Objetos** ✅ (lo disponible): grado y batería con `GradoBadge` y
   `MedidorBateria` compartidos, y **stepper** de workflow (por verificar →
   verificado → listo) con `PasosEquipo`. `TileEquipo` de CMP queda como
   refinamiento estético cuando se integre.
3. **Shell**: sigue pendiente de decisión — el tablero hoy es una página propia
   (`/ops`), sin shell ni entrada en el menú, para no cambiar la navegación
   hasta la aprobación.

## 5. Qué se pide aprobar (además de las preguntas del piloto)

1. ¿El tablero ops representa lo que querés ver al entrar (dueño/gerente)?
2. ¿Las colas del taller (por verificar / verificado / listo) son el flujo
   correcto para taller e ingreso de mercadería?
3. ¿Activamos F3 después de F2, o lo dejamos para el final del rollout?
