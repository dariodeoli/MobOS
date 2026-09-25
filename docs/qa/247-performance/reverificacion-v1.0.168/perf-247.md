# Auditoría de performance (#247)

Fecha: 2026-09-25T15:11:43.030Z · CPU throttle 4x · 3 repeticiones (mediana)

| Pantalla | Carga | Listo (ms) | DOMContentLoaded | Load | API (n, ms prom) | Scripts (n, KB) |
| --- | --- | --- | --- | --- | --- | --- |
| inventario | fria | **781** | 209 | 214 | 11, 153 | 66, 398 |
| inventario | caliente | **482** | 67 | 67 | 16, 188 | 66, 19 |
| inventario | segunda | **647** | 97 | 97 | 11, 135 | 66, 19 |
| pos | fria | **1034** | 508 | 509 | 10, 98 | 51, 321 |
| pos | caliente | **416** | 65 | 65 | 10, 91 | 51, 15 |
| pos | segunda | **548** | 92 | 93 | 10, 85 | 51, 15 |
| pedidos | fria | **1000** | 253 | 258 | 11, 74 | 58, 344 |
| pedidos | caliente | **389** | 59 | 60 | 11, 82 | 58, 17 |
| pedidos | segunda | **491** | 84 | 85 | 11, 83 | 58, 17 |
| clientes | fria | **1042** | 198 | 203 | 15, 172 | 63, 370 |
| clientes | caliente | **399** | 61 | 61 | 15, 149 | 63, 18 |
| clientes | segunda | **543** | 88 | 89 | 15, 133 | 63, 18 |
| finanzas | fria | **927** | 279 | 279 | 18, 193 | 59, 347 |
| finanzas | caliente | **272** | 66 | 67 | 9, 86 | 59, 17 |
| finanzas | segunda | **387** | 91 | 91 | 9, 83 | 59, 17 |

## APIs más lentas por pantalla (primera corrida de cada combinación)

### inventario · fria
- 42 ms · 0 B · `/api/notifications`
- 40 ms · 0 B · `/api/presence/heartbeat`
- 28 ms · 0 B · `/api/presence`
- 26 ms · 0 B · `/api/combos`
- 24 ms · 0 B · `/api/inventory-units?`

### inventario · caliente
- 25 ms · 0 B · `/api/inventory-reservations`
- 22 ms · 0 B · `/api/inventory-units?view=removed`
- 20 ms · 0 B · `/api/transfers`
- 20 ms · 0 B · `/api/suppliers`
- 19 ms · 0 B · `/api/stock-locations`

Repetidas: /api/inventory-units ×2

### inventario · segunda
- 14 ms · 0 B · `/api/notifications`
- 12 ms · 0 B · `/api/products?limit=500`
- 12 ms · 0 B · `/api/orders?filtro=todos`
- 12 ms · 0 B · `/api/presence`
- 12 ms · 0 B · `/api/combos`

### pos · fria
- 22 ms · 0 B · `/api/notifications`
- 19 ms · 0 B · `/api/presence/heartbeat`
- 18 ms · 0 B · `/api/presence`
- 12 ms · 0 B · `/api/orders?filtro=todos`
- 10 ms · 0 B · `/api/products?limit=500`

### pos · caliente
- 14 ms · 0 B · `/api/products?limit=500`
- 14 ms · 0 B · `/api/orders?filtro=todos`
- 13 ms · 0 B · `/api/combos`
- 12 ms · 0 B · `/api/payment-accounts`
- 11 ms · 0 B · `/api/notifications`

### pos · segunda
- 12 ms · 0 B · `/api/products?limit=500`
- 12 ms · 0 B · `/api/orders?filtro=todos`
- 11 ms · 0 B · `/api/combos`
- 9 ms · 0 B · `/api/users`
- 9 ms · 0 B · `/api/inventory-branches`

### pedidos · fria
- 10 ms · 0 B · `/api/notifications`
- 9 ms · 0 B · `/api/products?limit=500`
- 9 ms · 0 B · `/api/orders?filtro=todos`
- 9 ms · 0 B · `/api/users`
- 8 ms · 0 B · `/api/presence/heartbeat`

Repetidas: /api/orders ×2

### pedidos · caliente
- 10 ms · 0 B · `/api/products?limit=500`
- 10 ms · 0 B · `/api/orders?filtro=todos`
- 9 ms · 0 B · `/api/orders?filtro=activos&limit=50`
- 8 ms · 0 B · `/api/users`
- 8 ms · 0 B · `/api/inventory-branches`

Repetidas: /api/orders ×2

### pedidos · segunda
- 10 ms · 0 B · `/api/products?limit=500`
- 10 ms · 0 B · `/api/orders?filtro=todos`
- 8 ms · 0 B · `/api/users`
- 8 ms · 0 B · `/api/notifications`
- 8 ms · 0 B · `/api/orders?filtro=activos&limit=50`

Repetidas: /api/orders ×2

### clientes · fria
- 29 ms · 0 B · `/api/message-templates`
- 28 ms · 0 B · `/api/customers?orden=actividad&limit=50`
- 20 ms · 0 B · `/api/follow-ups?due=today`
- 20 ms · 0 B · `/api/price-lists`
- 19 ms · 0 B · `/api/payment-accounts`

### clientes · caliente
- 13 ms · 0 B · `/api/customers?orden=actividad&limit=50`
- 13 ms · 0 B · `/api/message-templates`
- 11 ms · 0 B · `/api/notifications`
- 10 ms · 0 B · `/api/products?limit=500`
- 10 ms · 0 B · `/api/presence`

### clientes · segunda
- 11 ms · 0 B · `/api/customers?orden=actividad&limit=50`
- 11 ms · 0 B · `/api/message-templates`
- 10 ms · 0 B · `/api/products?limit=500`
- 10 ms · 0 B · `/api/orders?filtro=todos`
- 8 ms · 0 B · `/api/notifications`

### finanzas · fria
- 20 ms · 0 B · `/api/print/printers`
- 20 ms · 0 B · `/api/cash/audit?branchId=e2e-branch-1&date=2026-09-25`
- 19 ms · 0 B · `/api/cash/audit-operations?from=2026-09-18&to=2026-09-25&branchId=e2e-branch-1`
- 19 ms · 0 B · `/api/cash?sesiones=1&from=2026-08-27&to=2026-09-25&branchId=e2e-branch-1`
- 16 ms · 0 B · `/api/finance`

Repetidas: /api/finance ×2, /api/cash ×2

### finanzas · caliente
- 13 ms · 0 B · `/api/products?limit=500`
- 13 ms · 0 B · `/api/orders?filtro=todos`
- 12 ms · 0 B · `/api/finance`
- 9 ms · 0 B · `/api/users`
- 9 ms · 0 B · `/api/notifications`

### finanzas · segunda
- 10 ms · 0 B · `/api/products?limit=500`
- 9 ms · 0 B · `/api/orders?filtro=todos`
- 9 ms · 0 B · `/api/finance`
- 8 ms · 0 B · `/api/presence`
- 8 ms · 0 B · `/api/notifications`

