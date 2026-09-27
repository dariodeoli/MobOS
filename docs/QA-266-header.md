# #266 · Header: candado, chip a Mi perfil y sin íconos redundantes

Ajuste del header/nav pedido por Dario: el **candado** reemplaza al menú de tres
puntos, el **chip de usuario** (foto + nombre completo) lleva a **Mi perfil** y
salen los íconos de **persona** y **recarga**.

## Qué cambió

| Antes | Ahora |
|---|---|
| Menú de tres puntos (Configuración/Caja/Análisis/Clientes/Bloquear) en el topbar | **Candado** (`shell-bloquear`, aria «Bloquear pantalla») que bloquea al instante |
| Chip del pie con foto + nombre + rol, 1 clic cambiaba de vendedor y 3 clics bloqueaban | **Chip → Mi perfil** (`shell-mi-cuenta`, aria «Mi perfil (nombre)»), con foto + **nombre completo** + rol |
| Botón suelto de «Mi cuenta» (ícono de persona) y flecha de recarga junto al chip | **Fuera**: el chip hace ese trabajo |

- Los accesos que vivían en el menú de tres puntos siguen disponibles en la
  navegación lateral (Configuración, Caja, Análisis, Clientes) y el bloqueo pasa
  al candado; nada destructivo quedó a un toque.
- El **cambio de vendedor** sigue existiendo desde la pantalla de bloqueo
  («Cambiar usuario»), que es donde tiene sentido con PIN.
- La Ayuda y el cheat-sheet de atajos se actualizaron: **Candado = Bloquear
  pantalla** y **Chip = Mi perfil**.

## Evidencia (`docs/qa/266-header/{antes,despues}/`)

Medición del estado con la demo (dueño):

| Estado | Candado | Menú de tres puntos | Chip | Botón «Mi cuenta» suelto |
|---|---|---|---|---|
| **Antes** (producción v1.0.186) | ✗ | ✓ | aria «Mi cuenta» (ícono suelto) | ✓ |
| **Después** (rama) | ✓ | ✗ | «Hernán Acosta · Dueño» · aria «Mi perfil (Hernán Acosta)» | ✗ |

Capturas por modo: `claro/oscuro-desktop-pantalla`, `…-topbar` (el candado donde
estaba «…»), `…-chip` (foto + nombre), y `mobile-claro-pantalla` + `mobile-claro-cajon`
(el chip dentro del cajón). Se reproducen con `node scripts/qa-266-header.mjs`
(`QA_BASE_URL` para el host).

## Verificación

- **Bloqueo**: `e2e/sesion-bloqueo.spec.js` (5/5) usa el candado y cubre PIN,
  inactividad, recarga y los logos de la pantalla bloqueada.
- **Chip**: `e2e/qa-253-mi-cuenta.spec.js` e `ia-configuracion` entran a Mi
  cuenta desde el chip; `admin.spec.js` («el header usa el candado…») exige que
  el menú de tres puntos ya no exista y que lo destructivo viva en Configuración.
- **Mobile**: el gate `dsn-responsive-mobile.spec.js` mide el candado (44) y
  bloquea desde el header en 390.
- El componente huérfano `app/MenuAcciones.jsx` se retiró.

## Coordinación con PLT

El cambio toca `AppShell` (shell de PLT): se mantuvieron los testids y contratos
que ya usaban los e2e (`shell-mi-cuenta` en el chip) y se documentó el nuevo
(`shell-bloquear`). Si PLT suma `/mi-perfil` como ruta propia, el destino del
chip se cambia en una línea (`onMiCuenta` en `PanelVendedor`).
