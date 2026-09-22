# Paquete de aprobación · F3 “Tablero ops” (vista previa)

Addendum al paquete del piloto (`docs/rediseno/PILOTO-241.md`, DSN): suma el
**tablero de operaciones** del mock F3 con los **tokens v2** ya definidos para
las pantallas piloto. Nada se activa: es una vista previa para aprobar el rumbo
antes de conectar datos reales.

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

| Ruta / flag | Cuándo responde |
| --- | --- |
| `/ops-preview` | desarrollo, `VITE_OPS_PREVIEW=1` o `VITE_OPS_V2=1` |
| `/ops` (ruta real) | solo con `VITE_OPS_V2=1` |
| Menú | **sin entrada** hasta la aprobación |

- **Revisar la vista previa**: `npm run dev` → `http://localhost:5173/ops-preview`.
- **Activarla en un entorno**: cargar `VITE_OPS_V2=1` como variable de build en
  Coolify (frontend) → redeploy. Recién entonces `/ops` responde; agregar la
  entrada al menú/datos es el paso siguiente de la fase aprobada.
- La vista **no llama al API**: los datos del mock son ficticios (e2e lo
  verifica).

## 4. Qué falta para el F3 real (post-aprobación)

1. **Datos**: KPIs desde el resumen/analytics, equipos desde inventario (rack de
   #240) y colas desde pedidos/servicio.
2. **Objetos**: migrar los tiles a los de CMP (`TileEquipo`, `GradoBadge`,
   `MedidorBateria`) cuando estén en la biblioteca, y sumar el **stepper** de
   workflow (por verificar → verificado → listo).
3. **Shell**: decidir si F3 convive con el shell actual o reemplaza el inicio
   por rol (dueño/gerente).

## 5. Qué se pide aprobar (además de las preguntas del piloto)

1. ¿El tablero ops representa lo que querés ver al entrar (dueño/gerente)?
2. ¿Las colas *Up next / Queued / Ready* son el flujo correcto para taller e
   ingreso de mercadería?
3. ¿Activamos F3 después de F2, o lo dejamos para el final del rollout?
