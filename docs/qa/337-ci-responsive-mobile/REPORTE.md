# #337 · CI e2e v1.0.222: `dsn-responsive-mobile.spec.js:230` y `:359`

## Conclusión

**No es una regresión visual del POS ni un efecto de #332.** Son dos huecos del
propio spec (DSN), preexistentes desde la ronda POS de v1.0.220 (#308/#309), que
quedaron expuestos cuando el CI pasó a 4 shards con timeout 40 (#333). No se
tocó código de producto: el fix vive solo en `e2e/dsn-responsive-mobile.spec.js`.

## Por qué apareció en v1.0.222

- **v1.0.221** (run 37104804379): `dsn-responsive-mobile.spec.js` estaba en el
  shard 3, que **se canceló por timeout de 30 min**; el spec nunca terminó de
  correr (el shard 2 falló por qa-250, otro dominio).
- **v1.0.222** (run 37120326675): con 4 shards y timeout 40 (#333), el spec
  corrió completo en el shard 2 y falló sin reintentos.
- Entre v1.0.221 y v1.0.222 **no hubo cambios de landing ni de POS**
  (`src/components/ventas/`): el diff del release es CI/4-shards, RUC y
  precios-listas. #332 (v1.0.220) solo cambió el switch de `SellerCatalog` y las
  etiquetas del menú de `PanelVendedor`; la pantalla que se mide en `/pos` es
  `FormularioVenta`.

## Causas

### :359 demo 390 — el prep no elige variante

Agrega «iPhone 15 Pro 256GB», que en la demo tiene **dos variantes**
(Titano/Negro). Desde #308 el POS pide elegir el color exacto antes de sumarlo
(«Elegí la variante») y el spec esperaba el botón «Ver detalle…» sin elegir.
Evidencia: `causa-demo-variante-390.png` (captura del CI v1.0.222).

### :230 pos 390 — el audit medía el menú cerrado

Los 3 «cortados» eran botones del menú **«Más»** (Gift cards / Analytics /
Ventas suspendidas) que desde #309 viven en un `<details>` cerrado. Chromium les
conserva layout (`content-visibility: hidden`) y quedan fuera del viewport
(`left=-59`, `right=171`) aunque no se pintan. Medición del diagnóstico:

```json
{"total":3,"cortados":[
  {"texto":"Gift cards","izquierda":-59,"derecha":171},
  {"texto":"Analytics","izquierda":-59,"derecha":171},
  {"texto":"Ventas suspendidas","izquierda":-59,"derecha":171}
]}
```

Evidencia: `causa-pos-medicion-390.png` (captura del CI: nada cortado a la
vista). No hay desborde del documento (`scroll=0`).

## Fix (solo spec DSN)

- `auditar()`: `visible()` ignora el contenido de un `<details>` cerrado salvo
  el `<summary>` que lo abre (`enMenuCerrado`).
- Prep de la demo: si aparece `selector-variante`, elige la primera variante
  (con una sola variante el producto entra directo, sin cambios).
- Modal del POS: abre «Más» antes de disparar «Ventas suspendidas». El menú de
  #309 había dejado el disparador viejo inmóvil y el modal ya no se auditaba
  (se saltaba en silencio con el `catch` del propio harness).

## Verificación local (arnés aislado, `--repeat-each=2`)

```
MOBOS_E2E_PGDATA=/tmp/mobos-e2e-pg-MOS-DSN MOBOS_E2E_PGPORT=5503 \
MOBOS_E2E_API_PORT=3103 MOBOS_E2E_WEB_PORT=5203 \
npx playwright test e2e/dsn-responsive-mobile.spec.js --project=admin \
  --repeat-each=2 --grep "pos: 360|demo 360/390/414/768"
```

- **4/4 passed** (2 repeticiones de cada test fallado), 0 flaky.
- `pos`: 360/390/414/768 con `cortados=0`; modal del POS auditado
  (`cortados=0 chicos=0`).
- `demo`: 5 pantallas × 4 anchos sin scroll horizontal ni cortes.
- **Archivo completo** (`npx playwright test e2e/dsn-responsive-mobile.spec.js
  --project=admin`): **12/12 passed** (41 s), incluidas las 8 pantallas del
  barrido, las 4 superficies y los 7 grupos de Configuración.

## Evidencia

- `causa-demo-variante-390.png` — modal «Elegí la variante» (CI v1.0.222).
- `causa-pos-medicion-390.png` — estado medido en el fallo (CI v1.0.222).
- `despues/` — capturas y JSON de auditoría de la corrida local con el fix
  (`MOBOS_CAPTURAS=docs/qa/337-ci-responsive-mobile/despues`).
