# QA #201 — Demo: panel completo y funcional, solo sesión

Verificación de la demo pública (#192) como panel completo: todos los módulos
navegables con datos ficticios, guardados **solo en memoria/sesión** y formato
visible de “cómo funciona la demo”.

## Contrato del demo (invariante)

- **Ninguna llamada al API**: la barrera central (`src/lib/api/client.js`)
  corta `request()` y `apiFetch()` cuando el runtime es demo. El demo no toca
  la base real ni ninguna base demo (no existe una base demo: los datos salen
  del seed local).
- **Nada persiste**: en demo se saltean el espejo de `localStorage`
  (`bootFromMirror`/`persistMirror` en `src/lib/storage.js`). Lo que se carga
  vive en memoria de la pestaña y se descarta al recargar, cerrar o cambiar de
  perfil. El seed se re-ejecuta en cada carga.
- **La marca de demo no se filtra**: `/login` con una sesión demo activa limpia
  la marca y recarga (`src/lib/sesion.jsx`), así el login real no queda con la
  barrera de demo.
- **Honestidad**: lo que depende de hardware/sistema real (impresión, estado
  del sistema, seguridad de la cuenta) no se simula: muestra un aviso de “no
  disponible en la demo” (`src/components/app/DemoNoDisponible.jsx`).
- **IMEI**: la verificación se simula con el contrato del backend, marcada como
  simulada y sin costo (`src/lib/imeicheckDemo.js`). Cuando la UI de IMEI de
  #200 consuma el API, en demo debe usar este helper.

## Formato visible “Cómo funciona la demo”

- Panel: botón **Cómo funciona** en el banner + guía automática la primera vez
  por pestaña (una sola vez; se recuerda en `sessionStorage`). La entrada
  pública `/demo` ya no repite el bloque (#235).
- Contenido: `src/components/app/ComoFuncionaDemo.jsx` (perfiles, datos
  ficticios, nada se guarda, módulos, IMEI simulado).

## Verificación

Spec: `e2e/demo-anonimo.spec.js` (proyecto `core`, 7 tests):

```bash
MOBOS_E2E_PGDATA=/tmp/mobos-e2e-pg-<rama> MOBOS_E2E_PGPORT=<55xx> \
MOBOS_E2E_API_PORT=<31xx> MOBOS_E2E_WEB_PORT=<52xx> \
npx playwright test e2e/demo-anonimo.spec.js --project=core
```

| Test | Qué afirma |
|---|---|
| entra sin login y navega con datos ficticios | cero llamadas al API |
| dueño: un guardado en demo avisa que quedó simulado | toast “Cambio simulado” |
| sin sesión demo, la navegación directa vuelve a `/demo` | acceso real sigue en `/login` |
| todos los módulos del panel son navegables en demo | 29 rutas de Dueño con h1 correcto, sin errores de consola y sin API |
| el perfil vendedor también recorre sus módulos en demo | 9 rutas del Vendedor |
| un guardado en demo no se persiste y al recargar vuelve el estado inicial | sin claves `fono:cache:v3`, el integrante agregado desaparece |
| la marca de demo no se filtra al login real de la misma pestaña | el login real llama al API y llega al panel |

Resultado de la corrida: **7/7 en verde**. Evidencia y capturas en
`docs/qa/201-demo-panel/`.

## Límites intencionales del demo

- **Estado del sistema** y **Seguridad de la cuenta**: aviso de no disponible
  (consultan servicios reales).
- **Finanzas**: créditos, cuotas y comisiones quedan fuera del demo (necesitan
  el API real).
- **Impresión**: se muestran impresoras/filas demo, sin sondeo real.
- **IMEI real**: no se ofrece en el demo; solo la simulación.
