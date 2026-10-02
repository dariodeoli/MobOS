# QA-295 · Estado público honesto

La página pública `/status` no puede anunciar «Operación parcialmente degradada»
cuando lo único que pasó es que un chequeo requiere sesión, solo puede probar
configuración o no obtuvo respuesta. El estado público coincide con la realidad
verificable y lo no verificable se informa como tal.

## Estados explícitos (`src/lib/status/checks.js`)

| Estado | Etiqueta | ¿Suma al aviso de degradación? | Cuándo |
|---|---|---|---|
| `operational` | Operativo | No | La comprobación respondió y confirmó servicio. |
| `degraded` | Degradado | **Sí** | El servidor respondió un veredicto negativo verificable (base `unavailable`, correo `unconfigured`, OAuth no configurado, endpoint con error). |
| `restricted` | Requiere sesión | No | El endpoint respondió 401/403: no es una caída, falta sesión (reservas). |
| `unverifiable` | No verificable públicamente | No | Sin respuesta, o solo se puede comprobar la configuración (correo), o el veredicto no es concluyente. |

Reglas de honestidad:

- Una **falla de red** no es una degradación verificada: se muestra
  «No verificable públicamente» (nunca «Degradado» inventado).
- El sitio de la app **no autoriza CORS** a `moboss.online` (comprobado en
  producción), así que el chequeo usa `mode: 'no-cors'`: un fetch normal se
  bloqueaba y parecía una caída.
- `health 503` por base caída deja al **API operativo** y a la **base degradada**
  (antes se arrastraba la caída al API).
- Reservas 401 → **Requiere sesión** (antes disparaba «Operación parcialmente
  degradada» con la app funcionando).
- Correo `configured` → **No verificable públicamente**: la configuración se
  lee, el envío real no se prueba sin una sesión.
- Sin ningún resultado se dice «No pudimos verificar el estado desde este
  navegador»; no se afirma «operativo» ni se inventa degradación.

## Sistema: botones deshabilitados con explicación

En Configuración → Sistema, mientras corre la comprobación, «Copiar informe» y
«Actualizar» quedan deshabilitados con:

- `title`: «Se habilita al terminar la comprobación en curso.»
- Aviso visible `data-testid="sistema-comprobando"`:
  «Comprobando… los botones se habilitan al terminar.»

## Evidencia

```bash
# Tests unitarios de estados y resumen
node --test src/lib/status/checks.test.js

# E2E + capturas (hosts públicos interceptados; no toca producción)
MOBOS_295_CAPTURAS=docs/qa/295-estado-publico \
  npx playwright test e2e/qa-295-estado-publico.spec.js \
  && MOBOS_295_CAPTURAS=docs/qa/295-estado-publico \
  npx playwright test e2e/admin.spec.js --grep "#295"
```

Capturas en `docs/qa/295-estado-publico/`:

- `01-operativo.png`: app y base operativas, reservas «Requiere sesión» y correo
  «No verificable públicamente» sin aviso de degradación.
- `02-degradado-base.png`: base caída → aviso real, API operativo.
- `03-sin-verificar.png`: sin respuesta externa → «No pudimos verificar el
  estado…».
- `04-sistema-comprobando.png`: explicación visible de los botones.

La previsualización local de la página pública es `/status-preview` (DEV); en
producción sigue siendo `/status` en `moboss.online`.
