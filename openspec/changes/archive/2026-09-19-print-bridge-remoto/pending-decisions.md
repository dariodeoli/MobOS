# Pending decisions — print-bridge-remoto

Estado: **resueltas 2026-09-19** — todas por la recomendación. `sdd-propose` desbloqueado.
Fuente: `openspec/changes/print-bridge-remoto/exploration.md` (Open Questions 1-6).

| # | Pregunta | Opciones | Recomendación | Estado |
|---|---|---|---|---|
| 1 | Config de impresoras | backend por empresa (con caché) / seguir en localStorage | backend + caché | **RESUELTO: backend por empresa** |
| 2 | Distribución del instalador | tarball servido por backend / release GitHub / .pkg firmado | tarball + one-liner | **RESUELTO: servido por el backend** |
| 3 | Secreto de validación | cliente genera y servidor valida / servidor genera / puente lo agrega | cliente genera, servidor valida | **RESUELTO** |
| 4 | Retención y privacidad | solo metadatos (payload se borra al imprimir) / guardar payload N días | solo metadatos | **RESUELTO: payload se borra al imprimir** |
| 5 | Latencia | polling 2 s / long-poll / WebSocket-SSE | polling 2 s + backoff | **RESUELTO: polling 2 s** |
| 6 | Prioridad en la Mac del puente | local primero / siempre por servidor | local primero | **RESUELTO: local primero** |

Preguntas técnicas no bloqueantes (las resuelve `design`, no el usuario): tope de tamaño del payload,
duración del lease y política de requeue, TTL del código de vinculación y rol que crea puentes,
esquema de backoff, y si el encolado remoto arranca solo con tickets de prueba o con todos.

Rollback previsto en la propuesta: bandera para desactivar el encolado remoto y
volver al camino local + diálogo manual.
