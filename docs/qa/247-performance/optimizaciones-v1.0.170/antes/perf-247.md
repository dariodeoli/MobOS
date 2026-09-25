# Auditoría de performance (#247)

Fecha: 2026-09-25T16:15:21.332Z · CPU throttle 4x · 3 repeticiones (mediana)

| Pantalla | Carga | Listo (ms) | DOMContentLoaded | Load | API (n, ms prom) | Scripts (n, KB) |
| --- | --- | --- | --- | --- | --- | --- |
| inventario | fria | **1002** | 219 | 224 | 11, 128 | 66, 404 |
| inventario | caliente | **723** | 70 | 70 | 11, 125 | 66, 19 |
| inventario | segunda | **874** | 87 | 87 | 11, 123 | 66, 19 |
| pos | fria | **941** | 274 | 274 | 10, 90 | 51, 334 |
| pos | caliente | **495** | 63 | 63 | 10, 106 | 51, 15 |
| pos | segunda | **639** | 87 | 88 | 10, 91 | 51, 15 |
| pedidos | fria | **1036** | 255 | 259 | 11, 104 | 58, 357 |
| pedidos | caliente | **494** | 59 | 59 | 11, 110 | 58, 17 |
| pedidos | segunda | **647** | 83 | 84 | 11, 99 | 58, 17 |
| clientes | fria | **1005** | 259 | 260 | 15, 141 | 63, 383 |
| clientes | caliente | **559** | 62 | 62 | 15, 162 | 63, 18 |
| clientes | segunda | **684** | 85 | 86 | 15, 160 | 63, 18 |
| finanzas | fria | **1040** | 259 | 264 | 19, 234 | 59, 360 |
| finanzas | caliente | **289** | 63 | 63 | 9, 123 | 59, 17 |
| finanzas | segunda | **485** | 89 | 89 | 9, 135 | 59, 17 |

## APIs más lentas por pantalla (primera corrida de cada combinación)

### inventario · fria
- 31 ms · 0 B · `/api/notifications`
- 29 ms · 0 B · `/api/presence/heartbeat`
- 24 ms · 0 B · `/api/orders?filtro=todos`
- 23 ms · 0 B · `/api/presence`
- 15 ms · 0 B · `/api/inventory-units?`

### inventario · caliente
- 29 ms · 0 B · `/api/products?limit=500`
- 20 ms · 0 B · `/api/orders?filtro=todos`
- 15 ms · 0 B · `/api/inventory-units?`
- 12 ms · 0 B · `/api/notifications`
- 9 ms · 0 B · `/api/users`

### inventario · segunda
- 21 ms · 0 B · `/api/orders?filtro=todos`
- 15 ms · 0 B · `/api/products?limit=500`
- 13 ms · 0 B · `/api/inventory-units?`
- 12 ms · 0 B · `/api/users`
- 12 ms · 0 B · `/api/inventory-branches`

### pos · fria
- 18 ms · 0 B · `/api/orders?filtro=todos`
- 15 ms · 0 B · `/api/products?limit=500`
- 12 ms · 0 B · `/api/notifications`
- 10 ms · 0 B · `/api/presence`
- 10 ms · 0 B · `/api/presence/heartbeat`

### pos · caliente
- 27 ms · 0 B · `/api/products?limit=500`
- 19 ms · 0 B · `/api/orders?filtro=todos`
- 10 ms · 0 B · `/api/notifications`
- 9 ms · 0 B · `/api/users`
- 9 ms · 0 B · `/api/inventory-branches`

### pos · segunda
- 21 ms · 0 B · `/api/orders?filtro=todos`
- 21 ms · 0 B · `/api/products?limit=500`
- 8 ms · 0 B · `/api/users`
- 8 ms · 0 B · `/api/notifications`
- 7 ms · 0 B · `/api/inventory-branches`

### pedidos · fria
- 18 ms · 0 B · `/api/orders?filtro=todos`
- 11 ms · 0 B · `/api/products?limit=500`
- 10 ms · 0 B · `/api/users`
- 10 ms · 0 B · `/api/orders?filtro=activos&limit=50`
- 8 ms · 0 B · `/api/presence`

Repetidas: /api/orders ×2

### pedidos · caliente
- 25 ms · 0 B · `/api/products?limit=500`
- 22 ms · 0 B · `/api/orders?filtro=todos`
- 10 ms · 0 B · `/api/orders?filtro=activos&limit=50`
- 8 ms · 0 B · `/api/notifications`
- 8 ms · 0 B · `/api/presence/heartbeat`

Repetidas: /api/orders ×2

### pedidos · segunda
- 20 ms · 0 B · `/api/products?limit=500`
- 18 ms · 0 B · `/api/orders?filtro=todos`
- 11 ms · 0 B · `/api/orders?filtro=activos&limit=50`
- 8 ms · 0 B · `/api/users`
- 7 ms · 0 B · `/api/inventory-branches`

Repetidas: /api/orders ×2

### clientes · fria
- 18 ms · 0 B · `/api/customers?orden=actividad&limit=50`
- 17 ms · 0 B · `/api/message-templates`
- 16 ms · 0 B · `/api/orders?filtro=todos`
- 14 ms · 0 B · `/api/payment-accounts`
- 10 ms · 0 B · `/api/combos`

### clientes · caliente
- 24 ms · 0 B · `/api/products?limit=500`
- 20 ms · 0 B · `/api/orders?filtro=todos`
- 12 ms · 0 B · `/api/customers?orden=actividad&limit=50`
- 11 ms · 0 B · `/api/message-templates`
- 8 ms · 0 B · `/api/notifications`

### clientes · segunda
- 20 ms · 0 B · `/api/products?limit=500`
- 18 ms · 0 B · `/api/orders?filtro=todos`
- 13 ms · 0 B · `/api/customers?orden=actividad&limit=50`
- 12 ms · 0 B · `/api/message-templates`
- 8 ms · 0 B · `/api/users`

### finanzas · fria
- 24 ms · 0 B · `/api/orders?filtro=todos`
- 21 ms · 0 B · `/api/finance`
- 21 ms · 0 B · `/api/cash/audit-operations?from=2026-09-18&to=2026-09-25&branchId=e2e-branch-1`
- 20 ms · 0 B · `/api/cash/audit?branchId=e2e-branch-1&date=2026-09-25`
- 19 ms · 0 B · `/api/cash?branchId=e2e-branch-1`

Repetidas: /api/finance ×2, /api/cash ×2

### finanzas · caliente
- 28 ms · 0 B · `/api/products?limit=500`
- 20 ms · 0 B · `/api/orders?filtro=todos`
- 17 ms · 0 B · `/api/finance`
- 13 ms · 0 B · `/api/notifications`
- 12 ms · 0 B · `/api/presence/heartbeat`

### finanzas · segunda
- 28 ms · 0 B · `/api/products?limit=500`
- 27 ms · 0 B · `/api/orders?filtro=todos`
- 25 ms · 0 B · `/api/finance`
- 15 ms · 0 B · `/api/inventory-branches`
- 14 ms · 0 B · `/api/users`

