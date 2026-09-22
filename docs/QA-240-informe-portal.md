# #240 ítem 3 — Verificación del informe en el portal + WhatsApp con link

Verificación post-deploy (**post-.143**) de dos piezas del acceso del cliente al
informe de dispositivo:

1. **El informe en el portal** (`/cuenta/<token>`): la sección “Informes de tus
   equipos” con “Ver informe” por equipo comprado, y el informe público
   abriéndose desde ahí.
2. **Compartir por WhatsApp** desde la ficha: el mensaje lleva el **link público**
   `/u/<serial>`.

## Cómo se verifica

`scripts/qa-240-informe-portal-demo.mjs` (reusable, sin sesión) corre contra la
**demo pública** — harness local y producción:

```bash
node scripts/qa-240-informe-portal-demo.mjs                                   # producción
MOBOS_QA_URL=http://localhost:5216 MOBOS_QA_OUT=/tmp/qa240p node scripts/qa-240-informe-portal-demo.mjs
```

- Paso 1: `/demo` → Vendedor → ficha de Lucía → Pedidos → el equipo con las
  acciones del informe.
- Paso 2: click en **Compartir por WhatsApp** → se lee la URL del chat
  (`api.whatsapp.com/send`) y se asserta que el mensaje lleva
  `/u/356789012345678` y menciona el informe.
- Paso 3: `/cuenta/demo-demo-cliente-lucia-rapido` → sección **“Informes de tus
  equipos”** con el enlace “Ver informe” (href `/u/…`).
- Paso 4: abrir el informe desde el portal → tienda, serial enmascarado y el
  aviso “no es un certificado oficial”.
- Extras: sella la versión desplegada en `resultados.json` y sale 1 si algo
  falla o si la demo consulta el API de clientes.

## Corrida local (harness con la rama)

**4/4 pasos OK** · 3 capturas en `docs/QA-240-informe-portal/`:

| Captura | Qué muestra |
|---|---|
| `01-ficha-equipo-acciones.png` | Ficha → Pedidos → el equipo con Ver informe / WhatsApp / correo / garantía |
| `02-portal-informes.png` | **Portal del cliente**: “… · Informes de tus equipos · iPhone 15 · 128 GB · MOB-#0008 · serial 345678 · Ver informe” |
| `03-informe-publico-desde-portal.png` | El informe público abierto desde el portal (tienda, serial enmascarado, aviso) |

Resultado crudo: `docs/QA-240-informe-portal/resultados.json` (corrida final
sobre **v1.0.143** en producción y corrida local previa sobre v1.0.142).

## Post-deploy .143 — ✅ verificado en v1.0.143

El release impactó y se corrió el guion contra la **demo pública**
(22/9/2026, 19:05 UTC): **4/4 pasos OK** y **0 llamadas** al API de clientes.
Las capturas de esta carpeta y `resultados.json` quedan sellados con la
**v1.0.143**:

```bash
node scripts/qa-240-informe-portal-demo.mjs
```

## Checks

- `scripts/qa-240-informe-portal-demo.mjs` **4/4 ✓** (harness).
- `npm run lint` 0 · `npm test` ✓ · sin marcadores (solo se agrega el guion y su
  evidencia; no hay cambios de producto en esta entrega).
