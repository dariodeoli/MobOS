# Auditoría de performance (#247)

Fecha: 2026-09-25T03:56:06.243Z · CPU throttle 4x · 3 repeticiones (mediana)

| Pantalla | Carga | Listo (ms) | DOMContentLoaded | Load | API (n, ms prom) | Scripts (n, KB) |
| --- | --- | --- | --- | --- | --- | --- |
| inventario | fria | **1857** | 419 | 836 | 18, 2743 | 227, 9855 |
| inventario | caliente | **1674** | 331 | 342 | 16, 2769 | 227, 63 |
| inventario | segunda | **2210** | 440 | 557 | 18, 2558 | 227, 63 |
| pos | fria | **1822** | 470 | 659 | 11, 1734 | 201, 8509 |
| pos | caliente | **1241** | 233 | 239 | 11, 1501 | 201, 55 |
| pos | segunda | **1906** | 461 | 607 | 11, 1129 | 201, 55 |
| pedidos | fria | **2417** | 534 | 821 | 12, 1857 | 212, 8972 |
| pedidos | caliente | **1355** | 260 | 266 | 12, 2066 | 212, 59 |
| pedidos | segunda | **1996** | 495 | 625 | 12, 1349 | 212, 59 |
| clientes | fria | **2635** | 475 | 855 | 16, 4306 | 225, 9686 |
| clientes | caliente | **1889** | 263 | 271 | 16, 3053 | 225, 62 |
| clientes | segunda | **2063** | 487 | 623 | 16, 1764 | 225, 62 |
| finanzas | fria | **1938** | 490 | 834 | 10, 2250 | 213, 8971 |
| finanzas | caliente | **1228** | 300 | 307 | 6, 1987 | 216, 60 |
| finanzas | segunda | **1684** | 474 | 735 | 10, 2909 | 211, 58 |

## APIs más lentas por pantalla (primera corrida de cada combinación)

### inventario · fria
- 595 ms · 0 B · `/api/suppliers`
- 594 ms · 0 B · `/api/stock-alerts?branchId=e2e-branch-1`
- 486 ms · 0 B · `/api/notifications`
- 469 ms · 0 B · `/api/presence/heartbeat`
- 465 ms · 0 B · `/api/presence/heartbeat`

Repetidas: /api/inventory-branches ×2, /api/presence/heartbeat ×2, /api/inventory-units ×2

### inventario · caliente
- 203 ms · 0 B · `/api/inventory-branches`
- 140 ms · 0 B · `/api/inventory-units?view=removed`
- 135 ms · 0 B · `/api/inventory-units?`
- 134 ms · 0 B · `/api/inventory-reservations`
- 133 ms · 0 B · `/api/transfers`

Repetidas: /api/inventory-branches ×2, /api/presence/heartbeat ×2, /api/inventory-units ×2

### inventario · segunda
- 226 ms · 0 B · `/api/inventory-branches`
- 222 ms · 0 B · `/api/suppliers`
- 222 ms · 0 B · `/api/fx`
- 154 ms · 0 B · `/api/inventory-units?view=removed`
- 146 ms · 0 B · `/api/inventory-units?`

Repetidas: /api/inventory-branches ×2, /api/presence/heartbeat ×2, /api/inventory-units ×2

### pos · fria
- 630 ms · 0 B · `/api/presence/heartbeat`
- 573 ms · 0 B · `/api/presence/heartbeat`
- 384 ms · 0 B · `/api/inventory-branches`
- 370 ms · 0 B · `/api/notifications`
- 257 ms · 0 B · `/api/presence`

Repetidas: /api/presence/heartbeat ×2

### pos · caliente
- 242 ms · 0 B · `/api/presence/heartbeat`
- 237 ms · 0 B · `/api/notifications`
- 231 ms · 0 B · `/api/presence/heartbeat`
- 225 ms · 0 B · `/api/presence`
- 140 ms · 0 B · `/api/orders?filtro=todos`

Repetidas: /api/presence/heartbeat ×2

### pos · segunda
- 154 ms · 0 B · `/api/orders?filtro=todos`
- 145 ms · 0 B · `/api/products?limit=500`
- 145 ms · 0 B · `/api/users`
- 143 ms · 0 B · `/api/inventory-branches`
- 114 ms · 0 B · `/api/presence/heartbeat`

Repetidas: /api/presence/heartbeat ×2

### pedidos · fria
- 321 ms · 0 B · `/api/presence/heartbeat`
- 305 ms · 0 B · `/api/presence/heartbeat`
- 243 ms · 0 B · `/api/notifications`
- 232 ms · 0 B · `/api/presence`
- 220 ms · 0 B · `/api/orders?filtro=activos&limit=50`

Repetidas: /api/orders ×2, /api/presence/heartbeat ×2

### pedidos · caliente
- 337 ms · 0 B · `/api/notifications`
- 336 ms · 0 B · `/api/presence/heartbeat`
- 334 ms · 0 B · `/api/presence/heartbeat`
- 275 ms · 0 B · `/api/presence`
- 240 ms · 0 B · `/api/orders?filtro=activos&limit=50`

Repetidas: /api/orders ×2, /api/presence/heartbeat ×2

### pedidos · segunda
- 220 ms · 0 B · `/api/presence/heartbeat`
- 207 ms · 0 B · `/api/presence/heartbeat`
- 198 ms · 0 B · `/api/notifications`
- 185 ms · 0 B · `/api/orders?filtro=activos&limit=50`
- 167 ms · 0 B · `/api/combos`

Repetidas: /api/orders ×2, /api/presence/heartbeat ×2

### clientes · fria
- 888 ms · 0 B · `/api/customers?orden=actividad&limit=50`
- 881 ms · 0 B · `/api/message-templates`
- 874 ms · 0 B · `/api/price-lists`
- 873 ms · 0 B · `/api/follow-ups?due=today`
- 867 ms · 0 B · `/api/customers/summary`

Repetidas: /api/presence/heartbeat ×2

### clientes · caliente
- 346 ms · 0 B · `/api/message-templates`
- 326 ms · 0 B · `/api/presence/heartbeat`
- 325 ms · 0 B · `/api/notifications`
- 323 ms · 0 B · `/api/presence/heartbeat`
- 311 ms · 0 B · `/api/presence`

Repetidas: /api/presence/heartbeat ×2

### clientes · segunda
- 145 ms · 0 B · `/api/message-templates`
- 102 ms · 0 B · `/api/presence/heartbeat`
- 98 ms · 0 B · `/api/presence/heartbeat`
- 96 ms · 0 B · `/api/customers?orden=actividad&limit=50`
- 85 ms · 0 B · `/api/presence`

Repetidas: /api/presence/heartbeat ×2

### finanzas · fria
- 644 ms · 0 B · `/api/products?limit=500`
- 631 ms · 0 B · `/api/finance`
- 625 ms · 0 B · `/api/orders?filtro=todos`
- 603 ms · 0 B · `/api/users`
- 229 ms · 0 B · `/api/presence/heartbeat`

Repetidas: /api/presence/heartbeat ×2

### finanzas · caliente
- 584 ms · 0 B · `/api/orders?filtro=todos`
- 452 ms · 0 B · `/api/users`
- 452 ms · 0 B · `/api/finance`
- 428 ms · 0 B · `/api/products?limit=500`
- 428 ms · 0 B · `/api/inventory-branches`

### finanzas · segunda
- 475 ms · 0 B · `/api/notifications`
- 474 ms · 0 B · `/api/presence/heartbeat`
- 473 ms · 0 B · `/api/presence/heartbeat`
- 469 ms · 0 B · `/api/presence`
- 272 ms · 0 B · `/api/orders?filtro=todos`

Repetidas: /api/presence/heartbeat ×2

