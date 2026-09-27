# QA #276/#277 · impresión (transporte honesto y ticket corto)

- Base: http://127.0.0.1:5237
- Fecha: 2026-09-27T04:54:25.462Z
- Método: demo como dueño (datos ficticios) con capturas.

| Paso | Estado | Detalle | Captura |
| --- | --- | --- | --- |
| demo como dueño | ✅ ok | v1.0.190 |  |
| #276 · historial con transporte honesto | ✅ ok | solicitado · ejecutado con fallback · conexión física visibles | 01-historial-transporte.jpg |
| #277 · ticket corto predeterminado y plantilla | ✅ ok | el corto sale solo con título + validación XXXX-XX; la plantilla se edita y guarda | 02-ticket-corto-plantilla.jpg 03-plantilla-guardada.jpg |

**Lectura:** el historial muestra por trabajo lo **solicitado** (TCP/CUPS), lo
**ejecutado** (TCP directo/CUPS/USB directo) con el **fallback** y su motivo, y la
**conexión física** resuelta por la URI de la cola; el ticket de prueba corto es
el predeterminado y la **plantilla** (qué incluye, ancho 58/80, cortes, copias)
se edita desde la ficha y queda guardada por impresora.
