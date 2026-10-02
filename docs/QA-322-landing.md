# QA-322 — Landing: reorganizar y acortar

Origen: auditoría del demo v1.0.209 (issue #322).

## Qué cambió

La landing se rearmó en el orden de la propuesta y se sacaron las secciones y
maquetas repetidas:

| Orden | Sección | Implementación |
|---|---|---|
| 1 | Hero + captura real | Beneficio primero («Vendé más rápido. Controlá todo el negocio.»), CTAs diferenciados y **captura real del panel** (`public/landing/panel.png`, generada desde la demo) en el marco de navegador |
| 2 | Evidencia verificable y seguridad | Franja de 4 hechos concretos + acceso de tienda, PIN por persona y auditoría |
| 3 | Tres pilares | **Vender · Controlar · Cerrar la operación**, cada uno con 4 puntos; reemplaza la grilla de 9 módulos con maquetas |
| 4 | Flujo | **Proveedor → Inventario → Venta → Posventa** (antes era un paso a paso solo del POS) |
| 5 | Verificación IMEI | Se conserva el verificador interactivo; se quitaron los términos internos («mock», «Fase 1», «idempotencia») y quedó la explicación honesta |
| 6 | Beneficios por rol | **Dueño · Vendedor · Técnico** (absorbe la antigua sección de accesos) |
| 7 | Portal e impresión | Captura real del portal del cliente (`public/landing/portal.png`) + impresión 58/80 mm, A4 y offline en una sola sección (antes eran dos) |
| 8 | Precio, FAQ y CTA | Plan transparente (equipo, sucursales, hardware, soporte), FAQ sin jerga y cierre con las dos acciones |

Además:

- **Menú móvil**: botón hamburguesa con panel de secciones + CTAs (antes los
  enlaces desaparecían en mobile). Cierra al navegar y tiene área táctil 44.
- **Pie legal**: Soporte (`mailto:soporte@moboss.online`), Estado (`/status`),
  Privacidad y Términos. Las dos páginas nuevas (`/privacidad`, `/terminos`)
  son un resumen informativo y factual del servicio.
- **CTAs diferenciados**: «Probar la demo» siempre al demo; «Crear mi tienda» /
  «Ingresar» al alta. El portal enlaza a la cuenta demo real.
- **Sin repeticiones**: se eliminaron la grilla de módulos con maquetas
  (`CapturaModulo`), el mock del portal y la sección duplicada de offline; cada
  `h2` aparece una sola vez.
- **Largo**: la auditoría reportó ~15.000 px; en 390 px la landing mide
  **10.718 px** (−29 %), con **0 scroll horizontal, 0 cortes y 0 targets < 44**.

## Archivos

- `src/pages/Landing.jsx` — reescritura con menú móvil, capturas reales y el
  orden nuevo.
- `src/pages/LegalPublica.jsx` — Privacidad y Términos (públicas).
- `src/App.jsx` — rutas públicas `/privacidad` y `/terminos`, también en el
  host de la landing.
- `src/components/landing/ImeiVerificador.jsx` — textos sin jerga interna.
- `public/landing/panel.png` y `public/landing/portal.png` — capturas reales
  del producto (demo) usadas por la landing.
- `src/lib/disenoReglas.test.js` — la regla de landing pasa de «maquetas» a
  «capturas reales + menú + pie legal».
- `e2e/qa-322-landing.spec.js` — capturas, gate y evidencia.

## Evidencia

- Capturas: `docs/qa/322-landing/`
  (`landing-desktop.png`, `landing-mobile.png`, `landing-mobile-completa.png`,
  `landing-mobile-oscuro.png`, `landing-menu-mobile.png`,
  `captura-panel-demo.png`, `captura-portal-demo.png`,
  `privacidad-mobile.png`, `terminos-mobile.png`) y `auditoria-322.json`.

```bash
MOBOS_E2E_PGDATA=/tmp/mobos-e2e-pg-MOS-DSN MOBOS_E2E_PGPORT=5503 \
  MOBOS_E2E_API_PORT=3103 MOBOS_E2E_WEB_PORT=5203 \
  npx playwright test e2e/qa-322-landing.spec.js --project=admin
```

Resultado: **3/3 en verde** (menú móvil, sin repeticiones, pie legal, targets
≥ 44 y Privacidad/Términos). El gate responsive de #249 sobre la landing
(`dsn-responsive-mobile.spec.js -g landing`) queda verde.

## Pendientes honestos (no bloquean)

- **Casos reales**: la propuesta pedía una sección de casos; no hay material
  verificado del dueño, así que los escenarios quedaron dentro de los pilares.
  Cuando haya clientes reales, se suma su bloque.
- **Privacidad y Términos**: resumen informativo y factual; falta la revisión
  legal del dueño antes de considerarlo definitivo.
- **Tipo Inter/Plus Jakarta** (#320): la referencia quedó documentada; la
  adopción de la tipografía no entra en esta pasada.

## Verificaciones de entrega

- `npm run lint` → 0 errores.
- `npm run build` + `npm --prefix backend run build` → exit 0 con `BUILD_ID`.
- `npm --prefix backend run prisma:validate` → OK.
- `npm test` → 885 pass · 0 fail.
- `npm --prefix backend run test:unit` → 138 pass · 0 fail.
- `node scripts/e2e-shards.mjs --check` → shards balanceados.
