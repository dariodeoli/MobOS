# #240 ítem 3 — Informe en el portal, cronología y WhatsApp

Verificación post-deploy de las tres piezas del acceso del cliente al informe de
dispositivo:

1. **El informe en el portal** (`/cuenta/<token>`): sección “Informes de tus
   equipos” con “Ver informe” por equipo comprado, y el informe público
   `/u/<serial>` abriéndose desde ahí. Se recorre también en el subdominio
   `clientes.moboss.online` (#74).
2. **Compartir por WhatsApp** desde la ficha del cliente: el mensaje lleva el
   **link público** del informe.
3. **Cronología del cliente**: el envío queda registrado como “Informe del
   equipo compartido · Por WhatsApp · serial …” (demo en el navegador; cuenta
   real vía `CUSTOMER_DEVICE_REPORT_SHARED`).

## Cómo se verifica

`scripts/qa-240-informe-portal-demo.mjs` (reusable, sin sesión) corre contra la
**demo pública** — harness local, `app.moboss.online` y el subdominio del portal
en producción:

```bash
node scripts/qa-240-informe-portal-demo.mjs                                    # producción
MOBOS_QA_URL=http://localhost:5246 MOBOS_QA_API_HOST=api.moboss.online \
  MOBOS_QA_PORTAL_URL=http://localhost:5246 node scripts/qa-240-informe-portal-demo.mjs
```

- **Pasos 1-5:** `/demo` → ficha de Lucía → Pedidos → WhatsApp con el link →
  Cronología con el envío → `/cuenta/<token>` con “Informes de tus equipos” →
  informe público desde el portal.
- **Paso 6 (solo producción):** la cuenta demo en `clientes.moboss.online` y el
  informe abriéndose desde ahí. Si el build desplegado todavía no trae el fix
  del informe demo (ver abajo), el paso queda como **hallazgo documentado** en
  `resultados.json` y no como fallo de la verificación del portal.
- Sella la versión desplegada y sale 1 si algún paso falla o si la demo consulta
  el API de clientes.

## Corridas

### Local (harness, rama `slot/clientes`) — **6/6 ✅**

6 pasos y 6 capturas, 0 llamadas al API. Incluye el informe demo abierto desde
el portal cuando el enlace lleva `?demo=1` (fix de esta entrega).

### Producción — **v1.0.143 · 6/6 ✅** (5 capturas + 1 hallazgo)

Corrida del 22/9/2026 22:01 local contra `app.moboss.online` + `clientes.moboss.online`:
WhatsApp con el link, **cronología con el envío** y el informe abierto desde el
portal, todo verde y sin llamadas al API. El paso del subdominio verifica la
cuenta demo y deja el hallazgo del fix pendiente de deploy (el build .143 no lo
trae). Evidencia sellada en `resultados.json`.

## Observación cerrada — el informe demo no abría desde el portal del subdominio (#74)

**Síntoma:** en `clientes.moboss.online`, la cuenta demo listaba “Informes de tus
equipos” con su “Ver informe”, pero al abrirlo el informe público caía en “No
encontramos este equipo”.

**Causa:** el modo demo vive por origen/pestaña (`sessionStorage` del host que
pasó por `/demo`). El portal del subdominio resuelve la cuenta por el token
`demo-…` (no necesita `/demo`), pero el informe `/u/<serial>` sí dependía de
`isDemoRuntime` y consultaba el API real, que no conoce el serial ficticio.

**Fix (rama `slot/clientes`):**

| Archivo | Cambio |
|---|---|
| `src/pages/CuentaPublica.jsx` | el enlace “Ver informe” del portal demo agrega **`?demo=1`** |
| `src/pages/InformePublico.jsx` | con `?demo=1` resuelve el informe con los datos ficticios del navegador (mismo criterio que el token `demo-…` de la cuenta) |
| `src/components/customers/CustomerProfile.jsx` | el enlace del informe en demo (Ver informe / WhatsApp / copiar) también viaja con `?demo=1`, así el link compartido resuelve solo |
| `e2e/qa-240-informe.spec.js` | caso nuevo: portal demo **sin pasar por `/demo`** → “Ver informe” abre el informe (`?demo=1`) |

Un serial real nunca lleva el parámetro: la ruta pública y el portal real no
cambian.

## Evidencia

| Captura | Qué muestra |
|---|---|
| `01-ficha-equipo-acciones.png` | Ficha → Pedidos → el equipo con Ver informe / WhatsApp / correo / garantía |
| `02-cronologia-informe-compartido.png` | **Cronología del cliente**: “Informe del equipo compartido · Por WhatsApp · serial 3567…678” (autor Equipo) |
| `03-portal-informes.png` | **Portal del cliente** (app): “… · Informes de tus equipos · iPhone 15 · 128 GB · MOB-#0008 · serial 345678 · Ver informe” |
| `04-informe-publico-desde-portal.png` | El informe público abierto desde el portal (tienda, serial enmascarado, aviso) |
| `05-portal-subdominio.png` | **`clientes.moboss.online`**: la misma cuenta demo con “Ver informe” |
| `local-informe-publico-subdominio.png` | **Pre-deploy (harness local)**: el informe demo abriendo desde el portal con el fix `?demo=1` (la corrida de producción lo completa cuando el fix se despliegue) |

Resultado crudo: `docs/QA-240-informe-portal/resultados.json` (sellado con
**v1.0.143**).

## Pendientes

- El fix del informe demo del subdominio viaja en `slot/clientes`: cuando el
  release que lo incluya impacte en producción, el paso 6 se completa solo
  (abre el informe y agrega la captura `06-informe-publico-subdominio.png`) y el
  hallazgo desaparece de `resultados.json`. Se re-corre con:

  ```bash
  node scripts/qa-240-informe-portal-demo.mjs
  ```

- El informe en el portal de la **cuenta real** (no demo) se cubre en el arnés
  con `e2e/qa-240-informe.spec.js` (crea cliente/unidad/venta y verifica link,
  WhatsApp, cronología y cuenta).

## Checks de esta entrega

- `scripts/qa-240-informe-portal-demo.mjs` **6/6 local** y **6/6 producción
  v1.0.143** (5 capturas + 1 hallazgo del fix pendiente de deploy).
- `npx playwright test e2e/qa-240-informe.spec.js`: 3/3 verdes (uno re-intentado
  por lentitud del harness).
- `npm run lint` 0 errores · `npm test` **617 ✓** · backend `test:unit` **71 ✓** ·
  `npm run build` y `npm --prefix backend run build` con `BUILD_ID` ✓ ·
  `prisma:validate` ✓ (sin cambios de schema) · `test:e2e:smoke` **7/7 ✓** · sin
  marcadores de conflicto.
