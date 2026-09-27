# Verificación post-deploy v1.0.191 — #256 secundarias · #271 avatar · #277 plantilla

Producción: **https://app.moboss.online · v1.0.191** (27/09/2026). Capturas en
claro, oscuro y móvil; evidencia cruda en `docs/qa/post-deploy-v191/`.

## #256 · Páginas secundarias (composición compacta)

`node scripts/qa-secundarias.mjs` (demo pública) → **6/7 con barra visible** y
títulos visibles: **Productos, Promociones, Pedidos, Cotizaciones, Plantillas y
Delivery** (la séptima es el pipeline del dueño en Trade-In, que no es
secundaria de vendedor). Capturas 3 temas por página + `resultado.json` en
`docs/qa/post-deploy-v191/secundarias/`.

Nota: el release también llevó #256 a **Inventario, Servicio y garantías,
Finanzas (Caja/Comisiones)** — módulos de otros slots, fuera de esta pasada.

## #277 · Editor de la plantilla del ticket de prueba

`node scripts/qa-plantilla-prueba.mjs` → **editor 3/3** (claro, oscuro, móvil),
sin desborde en 390 y **ticket corto como predeterminado** (`tipo = corta`,
título + validación). La toma de acción muestra fecha/hora + 58 mm + corte
parcial + 2 copias; el completo sigue disponible. Evidencia:
`docs/qa/post-deploy-v191/plantilla/` (10 capturas + `resultado.json`).

**Contrato desplegado (biblioteca v0.49.0):** tipos `corta` (predeterminado) y
`completa`; la fecha del corto es un check; los cortes son las 4 variantes GS V
de la biblioteca (**sin** «sin corte»). El script de capturas se actualizó a ese
contrato para la verificación (la implementación original se reconcilió en la
integración, `73d312a3`).

## #271 · Foto anterior al recargar

Lo verificable sin credenciales en producción:

1. **El fix viaja en el bundle**: el asset `assets/AppShell-BEdfCaYy.js` incluye
   `cache:"no-cache"` junto al pedido de `/avatar` (revalidación del ETag).
2. **La API del avatar no expone datos sin sesión**: `GET
   https://api.moboss.online/api/users/<id>/avatar` → **401** («Falta sesión.»).
   (En `app.*`, un `/api` inexistente cae al HTML del SPA y da 200: usar el host
   del API para sondear.)
3. **Superficies del avatar en la demo**: Equipo y acceso **7 avatares**, Mi
   cuenta **2**, **0 imágenes rotas** y sin desborde en los 3 temas.

**Limitación honesta:** el «sin flash» del bloqueo requiere **sesión real** (el
demo resuelve el avatar sin red y no reproduce la ventana). Se verificó con el
fix aplicado localmente (**0/3 temas pintan la vieja**, ver
`docs/QA-VERIFICACION-271-277.md`) y lo cubre el spec de CI
`qa-271-avatar-sin-flash`. Queda pendiente una pasada autenticada en producción
si Dario quiere confirmarlo con su sesión.

## Cómo re-verificar

```sh
node scripts/qa-secundarias.mjs     QA_OUT=docs/qa/post-deploy-v191/secundarias
node scripts/qa-plantilla-prueba.mjs QA_OUT=docs/qa/post-deploy-v191/plantilla
node scripts/qa-271-produccion.mjs  QA_OUT=docs/qa/post-deploy-v191/avatar
```

Los tres entran por la demo pública y no requieren credenciales.
