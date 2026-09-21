# Caza de bugs ronda 2 — CRM (#204)

Garantías, Servicio Técnico (pipeline/checklists), portal (niveles/token) y
plantillas de WhatsApp. Sondas por API contra el arnés local + UI headless.

## Hallazgo corregido (BUG)

### 204-A · Portal: el enlace vigente dejaba sin salida la regeneración
- **Pasos:** ficha de un cliente → **Portal del cliente** → se genera el enlace/QR → **Cerrar** → volver a abrir **Portal del cliente**.
- **Esperado:** el aviso “Ya hay un enlace vigente…” con el botón **Regenerar** disponible.
- **Real (antes):** el aviso aparecía pero **Regenerar quedaba deshabilitado** (el botón exigía `portal.token`, que ya no se sirve por seguridad desde #178): callejón sin salida para recuperar el enlace.
- **Fix:** habilitar Regenerar cuando hay enlace reutilizado (`portal.reused`), sin relajar Copiar/Abrir (siguen deshabilitados porque el token no se re-muestra).
- **Evidencia:** `portal-regenerar-bug.png` (antes, botón tomado y deshabilitado) y `portal-regenerar-fixed.png` (después, enlace regenerado).
- **Regresión:** e2e `portal: el enlace vigente avisa y se puede regenerar` — verificado **rojo sin el fix y verde con el fix**.

## Verificado OK (sin hallazgo)

| Área | Sonda | Resultado |
|---|---|---|
| Garantías | Salto de estado (`RECIBIDO → READY`) | **409** “Transición de garantía no permitida” |
| Garantías | Regenerar enlace público | token nuevo de 64, el viejo **404**, el nuevo **200** |
| Garantías | Listado con enlace ya hasheado | `publicToken: null` + `hasPublicLink: true` (coherente con #178) |
| Garantías | Alta con días de garantía | vencimiento calculado (201) |
| Servicio | Costo con desglose vs `costPyg` | gana el desglose: **150.000** (partes 100.000 + mano de obra 50.000) |
| Servicio | Catálogo sugerido dos veces | idempotente (13 ítems, sin duplicados) |
| Servicio | Checklist con punto repetido | se reactiva sin duplicar (201 las dos veces) |
| Portal | Segundo pedido sin `regenerate` | `reused: true`, sin token, el enlace vigente sigue **200** (no rota) |
| Portal | Nivel inválido | **400** “Nivel de portal inválido” |
| Plantillas | Cuerpo de 1.201 caracteres | **400** “hasta 1.200 caracteres” |
| Plantillas | Dos predeterminadas en la categoría | queda **una** (la última) |
| Plantillas | Cambio de categoría | mueve `category` y su espejo `context` |

## Observaciones (documentadas, sin fix)

- **204-B · Servicio:** el PATCH acepta saltos de estado (`RECIBIDO → ENTREGADO` = 200) y también retrocesos. Es coherente con el form de edición (permite corregir el estado a mano), pero el pipeline del listado solo avanza de a uno; si se quiere monotónico como garantías, es una decisión de producto.
- **204-C · Servicio:** `POST /api/service-checklists` con un `deviceType` fuera de la lista conocida lo asigna a **iPhone** en silencio (la UI usa el select cerrado, así que no se ve).
- **204-D · Plantillas:** mover la plantilla predeterminada a otra categoría deja a la categoría vieja **sin predeterminada**; el menú de WhatsApp cae a la primera activa (funciona, pero la marca “predeterminada” queda vacía).
- **204-E · Garantías:** el POST rechaza `expiresAt: ''` si el cliente lo manda (la ficha ya lo omite desde #166); nit de compatibilidad de API.
