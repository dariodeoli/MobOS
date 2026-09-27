# A1 (#279) · Web Push — plan técnico y andamiaje

Notificaciones del **navegador** con permiso explícito. La **bandeja interna del
panel sigue siendo la fuente oficial** (`/api/notifications` + la campana): el
push solo avisa que hay algo nuevo y, al tocarlo, abre la pantalla.

## Principios (del plan aprobado #279 · A1)

1. **Permiso explícito**: nada se suscribe sin que la persona lo active; si el
   navegador no lo soporta o el permiso está denegado, la UI lo explica y la
   bandeja interna sigue funcionando igual.
2. **Sin datos sensibles en pantalla bloqueada**: el payload lleva **título y
   cuerpo genéricos** («Tenés una novedad en MobOS») y una **ruta interna**
   (`/pedidos`, `/clientes`, `/recepcion`…). Nunca cliente, montos, IMEI, tokens
   ni el texto de un comentario. El detalle vive en la bandeja interna.
3. **Sin duplicados**: un push por evento; el service worker usa `tag` por
   evento (`renotify: false`) y el aviso del sistema lo muestra **solo el SW**
   (la app no dispara notificaciones propias). Con varias pestañas abiertas el
   navegador entrega el push una sola vez.
4. **Horario silencioso por dispositivo**: ventana configurable (sugerido
   22:00–07:00). Los avisos **urgentes** (p. ej. incidencia) pueden saltearlo.
5. **La bandeja manda**: si el push falla o el permiso se revoca, no se pierde
   nada; el item sigue en la campana.

## Eventos (fase 2, al ritmo de sus módulos)

| Evento | Origen | Ruta del aviso |
| --- | --- | --- |
| Mención `@nombre` | comentario interno del pedido (#148 §16) | `/pedidos/<id>` |
| Alternativa propuesta | A5 (comprador propone) | `/compras` |
| Cotización aprobada | aceptación del cliente en el enlace público | `/cotizaciones` |
| Llegó un vendido en tránsito | A4 (vínculo del IMEI al recibir) | `/recepcion` |
| Incidencia de lote | F5 (recepción con incidencia) | `/recepcion` |
| Pedido listo | entrega: para retirar / para enviar | `/pedidos/<id>` |

## Arquitectura

```
navegador                         backend (Next API)
├─ webPush.js                     ├─ GET  /api/push/clave        → clave pública VAPID
│  permiso → PushManager.subscribe├─ POST /api/push/suscripciones → alta/actualización
│  → registro en el panel         ├─ DEL  /api/push/suscripciones → baja
├─ sw.js                          ├─ POST /api/push/prueba       → aviso de prueba
│  push → showNotification        └─ lib/web-push.ts
│  notificationclick → foco/ruta     vapidConfig · enviarWebPush
└─ bandeja interna (oficial)         horario silencioso · poda 404/410
```

- **Tabla**: `WebPushSubscription` (una fila por usuario+dispositivo; `endpoint`
  único → reconectar el mismo dispositivo **actualiza**, no duplica) con
  `silencioDesde/Hasta` (minutos desde 00:00) y `lastUsedAt` para diagnóstico.
- **VAPID**: variables `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.
  Se generan con `npx web-push generate-vapid-keys` y viven en las variables
  privadas del Hub (nunca en el repo). Sin claves la API responde
  `{ configurado: false }`, la UI no ofrece la opción y **todo lo demás sigue**.
- **Envío**: `enviarWebPush({ tenantId, userId, titulo, cuerpo, url, tag,
  urgente })` respeta el silencio de cada dispositivo, poda endpoints muertos
  (404/410) y **nunca lanza** (la bandeja no depende de esto).
- **PWA**: el `push`/`notificationclick` se suman al service worker **sin tocar**
  el precache ni la estrategia de red del shell (sigue andando offline).

## Andamiaje entregado (esta fase)

- Migración `20261229000000_web_push_subscriptions` (aditiva e idempotente).
- `backend/lib/web-push.ts` + rutas `/api/push/{clave,suscripciones,prueba}`.
- `src/lib/webPush.js` (permiso, alta/baja, sincronización al arrancar).
- `public/sw.js`: `push` + `notificationclick` (genérico, `tag`, foco/ruta).
- Unit del backend: silencio (inclusive cruce de medianoche), payload genérico y
  “sin configurar”.

## Fase 2 entregada

- **Preferencias** (`src/components/app/Preferencias.jsx`): bloque «Avisos del
  navegador» con los estados honestos (no soportado / **sin configurar** /
  permiso denegado / activo) y **horario silencioso** por dispositivo
  (22→07 sugerido), guardado en la suscripción del panel.
- **Eventos** (`backend/lib/web-push-eventos.ts`): derivación **espejo de la
  bandeja** para MENCION (comentarios con el mismo `mencionadosEn`/variantes y
  ventana de 7 días), COTIZACION_APROBADA (del vendedor), INCIDENCIA (avisa a
  administración) y PEDIDO_LISTO (del vendedor). `ALTERNATIVA` y `TRANSITO`
  quedan catalogados y **esperan A5/A4**: cuando existan, sus módulos llaman a
  `despacharEventosWebPush` sin duplicar derivaciones.
- **Despacho**: dedupe por `(usuario, evento)` en `WebPushEnvio` (un aviso por
  evento, nunca repetido), silencio por dispositivo, poda de endpoints muertos.
  Se dispara desde el shell (al abrir y cada 5 min) y desde el **cron interno**
  `POST /api/internal/push-eventos` (token de mantenimiento) para dispositivos
  con la app cerrada.
- **Métricas**: `GET /api/push/metricas` (propias y, para administración, las de
  la tienda) con evaluados/enviados/silenciados/podados por resultado.

## Pendiente (fase 3)

- Wiring server-side de los eventos que viven en otros dominios (mención al
  crear el comentario, cotización al aceptarse, incidencia al confirmar la
  recepción, pedido listo al cambiar la entrega): hoy la derivación cubre esos
  casos por lectura; el aviso instantáneo con la app cerrada llega con el cron ✅
  y conviene además el push en el momento del hecho (llamada a
  `despacharEventosWebPush` desde esas rutas — **dominios POS/CRM/INV**).
- UI de métricas (hoy es API) y rotación de claves VAPID documentada en
  `docs/TOKENS.md`/ops cuando el deploy las habilite.
