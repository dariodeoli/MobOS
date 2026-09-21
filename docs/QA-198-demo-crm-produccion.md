# QA #198 — Demo público de Clientes/Servicio en producción

Estado a la fecha de esta corrida: **pendiente de deploy**. Producción todavía
no tiene el demo completo del CRM (#194): su lista de Clientes aparece vacía y
no muestra los seeds ficticios. La verificación queda **preparada y es
re-ejecutable** en cuanto el integrador deploye.

## Spec reutilizable

```bash
node e2e/prod/187-clientes.mjs          # capturas en QA198_SHOTS (por defecto /tmp/qa198)
```

- Entra a la demo (perfil Dueño o acceso anónimo, lo que esté deployado) y
  verifica: ficha con **deuda Gs 1.500.000**, últimas órdenes, **cronología**
  (“Pedido creado”), **seguro activo 12,5%** (interruptor tomado y
  deshabilitado), **WhatsApp con plantilla demo**, **portal por token demo**
  (`/cuenta` y `/portal`), **`?cliente=`** abriendo la ficha y **Servicio
  Técnico** con OS-#0001/OS-#0002.
- Afirma que **no haya pedidos al API real** (`/api/customers`,
  `/api/message-templates`, `/api/service-*`, `/api/portal`,
  `/api/public/portal`) durante el recorrido.
- Verifica los públicos con token inválido (mensaje genérico + 404 de la API).
- **Salida:** `0` = todo verificado; `3` = demo completo todavía sin deployar
  (con el detalle en `resumen.json`).
- Entornos alternativos: `QA_APP`, `QA_PORTAL`, `QA_API`, `QA198_SHOTS`.

## Verificado en esta corrida (antes del deploy)

| Punto | Resultado | Captura |
|---|---|---|
| Demo entra (perfil Dueño) | OK | `01-demo-entrada.png` |
| Lista de Clientes demo | **sin seeds** (pendiente de deploy) | `02-clientes-demo.png` |
| Público `/cuenta` token inválido | mensaje genérico, sin datos | `11-publico-cuenta.png` |
| Público `/portal` token inválido | mensaje genérico, sin datos | `11-publico-vitrina.png` |
| Público `/garantia` token inválido | mensaje genérico, sin datos | `11-publico-garantia.png` |
| API con token inválido | `portal` 404 · `vitrina` 404 · `garantia` 404 | — |

`resumen.json` de la corrida: `demo.seedVisible = false`, `pendienteDeploy = true`.

## Pasos para completar (post-deploy)

1. Esperar la integración de `slot/clientes` (incluye #194) y su deploy.
2. Correr `node e2e/prod/187-clientes.mjs` (sin sesión).
3. Con salida `0`, adjuntar `resumen.json` y las capturas `03…10` de la carpeta.
4. Si algo falla, los pasos exactos quedan en el JSON y en las capturas por
   paso (ficha, cronología, seguro, WhatsApp, portal, servicio).
