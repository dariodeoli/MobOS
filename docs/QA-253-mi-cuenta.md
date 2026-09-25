# #253 — Mi cuenta: perfil, preferencias y sesiones personales para todos los roles

Grupo **Mi cuenta** de la reorganización de Configuración (#253). Antes, lo
personal vivía dentro de Configuración (solo dueño): perfil y foto en «Mi
identidad», preferencias del dispositivo en una tarjeta y sesiones filtradas por
correo — sin entrada para el resto del equipo y con el correo rotulado «Correo
del dueño» aunque lo estuviera viendo otra persona.

## Auditoría: qué había y qué faltaba

- **Ya existía:** `MiIdentidad` (avatar, foto, nombre, correo e ID) dentro de
  `Config.jsx`; `PreferenciasContenido` (bloqueo por inactividad, notificaciones
  y salida del rediseño) en la misma sección; la tarjeta «Sesiones personales»
  del dueño filtrando `/api/account` por correo.
- **Brecha:** todo eso era **solo dueño** (`/configuracion/:seccion?` con
  guardia `owner`) y no había forma de llegar desde el avatar. Un vendedor no
  podía cambiar su nombre, su foto, sus minutos de bloqueo ni ver/cerrar sus
  propias sesiones. En la demo, además, la tarjeta de sesiones quedaba vacía.

## Entregado

| Archivo | Cambio |
|---|---|
| `backend/app/api/mi-cuenta/route.ts` (nuevo) | API **personal** para cualquier rol: `GET` (perfil + sesiones propias + sesión actual) y `PATCH` (`updateName`, `revokeSession` solo de lo propio, `revokeOtherSessions`). Nunca expone secretos ni datos de terceros; audita cada acción |
| `src/components/cuenta/MiCuenta.jsx` (nuevo) | Superficie personal: **perfil** (foto subida → Google → iniciales, nombre editable, correo e ID con copiar), **preferencias del dispositivo** (bloqueo por inactividad y notificaciones) y **sesiones personales** (sesión actual marcada, revocar, «cerrar las demás») |
| `src/components/control/Config.jsx` | Se retiran `MiIdentidad` y el bloque `mi-cuenta`: la persona ya no vive en Configuración (sí queda la pestaña para el dueño, que reutiliza el mismo componente) |
| `src/components/app/AppShell.jsx` | Botón **Mi cuenta** junto al avatar de la barra (y en el menú lateral de mobile), visible para todos los roles |
| `src/pages/PanelVendedor.jsx` · `src/App.jsx` · `src/lib/rutas.js` | Vista personal `/mi-cuenta` para cualquier rol; el dueño canoniza a su pestaña de Configuración y las rutas viejas siguen redirigiendo |

## Decisiones (documentadas)

- **Personal vs. empresa:** acá cada uno administra lo suyo (perfil, foto,
  preferencias y sesiones); los datos de la tienda, el equipo y las sesiones del
  resto siguen en Configuración → Seguridad y auditoría (solo dueño).
- **El dueño no pierde su lugar:** la IA de siete grupos conserva «Mi cuenta»;
  el resto del equipo entra por `/mi-cuenta`, que no pide permisos.
- **Preferencias por navegador:** el bloqueo por inactividad y las
  notificaciones se guardan por persona y dispositivo (no viajan a la empresa).
- **Sesiones con reglas claras:** la sesión actual no se revoca desde acá (se
  cierra con «Salir»); cada persona solo ve y revoca las propias.
- **Autoservicio del nombre:** el nombre se puede cambiar sin permisos de
  administración; el correo se muestra (se gestiona desde Equipo y acceso).
- **Demo funcional:** la cuenta demo se arma en la pestaña (nombre, correo,
  foto y una sesión local) sin llamar al API.

## Verificación

```bash
# e2e (dueño, vendedor y mobile), con capturas
MOBOS_E2E_PGDATA=/tmp/mobos-e2e-pg-MOS-CRM MOBOS_E2E_PGPORT=5510 \
  MOBOS_E2E_API_PORT=3110 MOBOS_E2E_WEB_PORT=5210 \
  MOBOS_CAPTURAS=docs/QA-253-mi-cuenta \
  npx playwright test e2e/qa-253-mi-cuenta.spec.js

# integración HTTP: perfil, nombre y sesiones propias (cualquier rol)
MOBOS_IT_EXECUTE=1 bash backend/tests/integration-http.sh
```

| Evidencia | Qué cubre |
|---|---|
| `docs/QA-253-mi-cuenta/01-antes-produccion.png` | **Antes** (producción v1.0.172): Mi cuenta dentro de Configuración, solo dueño, con «Correo del dueño» y sesiones vacías en la demo |
| `docs/QA-253-mi-cuenta/02-despues-mi-cuenta.png` | **Después** (dueño): perfil, preferencias y sesiones personales en una sola superficie |
| `docs/QA-253-mi-cuenta/03-vendedor-mi-cuenta.png` | **Después** (vendedor): la misma cuenta personal en `/mi-cuenta` desde el avatar |
| `docs/QA-253-mi-cuenta/04-mobile-mi-cuenta.png` | Mobile: se entra desde el menú lateral |
| `docs/QA-253-mi-cuenta/05-demo-mi-cuenta.png` | Demo: la cuenta se arma con los datos de la pestaña (Hernán Acosta, sesión local) |
| `e2e/qa-253-mi-cuenta.spec.js` | 4/4: dueño (avatar, preferencias persistentes, sesión actual), vendedor, demo y mobile |
| `backend/tests/mi-cuenta.mjs` | Autoservicio: perfil propio, renombre, la sesión actual no se revoca, las ajenas tampoco, «cerrar las demás» y sin secretos |
| `e2e/ia-configuracion.spec.js` · `e2e/config-guardado.spec.js` · `e2e/configuracion-lote5.spec.js` | La IA de siete secciones, el guardado del nombre y las preferencias siguen en verde con el contenido nuevo |

## Checks de esta entrega

`npm run lint` 0 errores (2 warnings preexistentes, ajenos) · `npm run build` y
`backend run build` con `BUILD_ID` ✓ · `prisma:validate` ✓ (sin cambios de
schema) · `npm test` **751 ✓** · backend `test:unit` **75 ✓** · integración HTTP
completa en verde · `e2e/qa-253-mi-cuenta.spec.js` **4/4** ·
`test:e2e:smoke` **19/19** · sin marcadores de conflicto.
