# Auditoría de performance (#247)

Fecha: 2026-09-25T16:17:26.233Z · CPU throttle 4x · 3 repeticiones (mediana)

| Pantalla | Carga | Listo (ms) | DOMContentLoaded | Load | API (n, ms prom) | Scripts (n, KB) |
| --- | --- | --- | --- | --- | --- | --- |
| inventario | fria | **865** | 183 | 185 | 9, 117 | 51, 329 |
| inventario | caliente | **626** | 73 | 74 | 9, 124 | 51, 15 |
| inventario | segunda | **723** | 85 | 86 | 11, 141 | 51, 15 |
| pos | fria | **1015** | 180 | 184 | 10, 82 | 51, 320 |
| pos | caliente | **461** | 61 | 61 | 10, 97 | 51, 15 |
| pos | segunda | **595** | 84 | 85 | 10, 102 | 51, 15 |
| pedidos | fria | **1003** | 195 | 196 | 9, 84 | 44, 277 |
| pedidos | caliente | **424** | 61 | 61 | 9, 91 | 44, 13 |
| pedidos | segunda | **540** | 83 | 83 | 9, 89 | 44, 13 |
| clientes | fria | **996** | 178 | 183 | 13, 141 | 45, 281 |
| clientes | caliente | **438** | 90 | 91 | 13, 142 | 45, 13 |
| clientes | segunda | **604** | 83 | 83 | 13, 132 | 45, 13 |
| finanzas | fria | **443** | 172 | 177 | 9, 94 | 36, 251 |
| finanzas | caliente | **257** | 58 | 61 | 9, 120 | 36, 11 |
| finanzas | segunda | **510** | 84 | 86 | 17, 164 | 36, 11 |

## APIs más lentas por pantalla (primera corrida de cada combinación)

### inventario · fria
- 31 ms · 0 B · `/api/notifications`
- 30 ms · 0 B · `/api/orders?filtro=todos`
- 29 ms · 0 B · `/api/presence/heartbeat`
- 24 ms · 0 B · `/api/presence`
- 16 ms · 0 B · `/api/products?limit=500`

### inventario · caliente
- 47 ms · 0 B · `/api/products?limit=500`
- 21 ms · 0 B · `/api/orders?filtro=todos`
- 16 ms · 0 B · `/api/notifications`
- 15 ms · 0 B · `/api/presence/heartbeat`
- 13 ms · 0 B · `/api/presence`

### inventario · segunda
- 21 ms · 0 B · `/api/products?limit=500`
- 21 ms · 0 B · `/api/orders?filtro=todos`
- 16 ms · 0 B · `/api/notifications`
- 14 ms · 0 B · `/api/presence`
- 13 ms · 0 B · `/api/presence/heartbeat`

### pos · fria
- 17 ms · 0 B · `/api/orders?filtro=todos`
- 10 ms · 0 B · `/api/products?limit=500`
- 10 ms · 0 B · `/api/notifications`
- 10 ms · 0 B · `/api/presence/heartbeat`
- 9 ms · 0 B · `/api/presence`

### pos · caliente
- 18 ms · 0 B · `/api/orders?filtro=todos`
- 17 ms · 0 B · `/api/products?limit=500`
- 10 ms · 0 B · `/api/notifications`
- 9 ms · 0 B · `/api/presence/heartbeat`
- 8 ms · 0 B · `/api/inventory-branches`

### pos · segunda
- 24 ms · 0 B · `/api/orders?filtro=todos`
- 21 ms · 0 B · `/api/products?limit=500`
- 9 ms · 0 B · `/api/users`
- 9 ms · 0 B · `/api/inventory-branches`
- 8 ms · 0 B · `/api/notifications`

### pedidos · fria
- 16 ms · 0 B · `/api/orders?filtro=todos`
- 14 ms · 0 B · `/api/products?limit=500`
- 13 ms · 0 B · `/api/users`
- 10 ms · 0 B · `/api/orders?filtro=activos&limit=50`
- 8 ms · 0 B · `/api/presence`

Repetidas: /api/orders ×2

### pedidos · caliente
- 17 ms · 0 B · `/api/products?limit=500`
- 17 ms · 0 B · `/api/orders?filtro=todos`
- 11 ms · 0 B · `/api/notifications`
- 10 ms · 0 B · `/api/presence`
- 10 ms · 0 B · `/api/orders?filtro=activos&limit=50`

Repetidas: /api/orders ×2

### pedidos · segunda
- 19 ms · 0 B · `/api/products?limit=500`
- 17 ms · 0 B · `/api/orders?filtro=todos`
- 10 ms · 0 B · `/api/orders?filtro=activos&limit=50`
- 8 ms · 0 B · `/api/notifications`
- 7 ms · 0 B · `/api/users`

Repetidas: /api/orders ×2

### clientes · fria
- 24 ms · 0 B · `/api/message-templates`
- 23 ms · 0 B · `/api/customers?orden=actividad&limit=50`
- 18 ms · 0 B · `/api/follow-ups?due=today`
- 16 ms · 0 B · `/api/orders?filtro=todos`
- 14 ms · 0 B · `/api/price-lists`

### clientes · caliente
- 23 ms · 0 B · `/api/products?limit=500`
- 18 ms · 0 B · `/api/orders?filtro=todos`
- 12 ms · 0 B · `/api/customers?orden=actividad&limit=50`
- 11 ms · 0 B · `/api/price-lists`
- 11 ms · 0 B · `/api/message-templates`

### clientes · segunda
- 19 ms · 0 B · `/api/products?limit=500`
- 16 ms · 0 B · `/api/orders?filtro=todos`
- 12 ms · 0 B · `/api/message-templates`
- 12 ms · 0 B · `/api/customers?orden=actividad&limit=50`
- 9 ms · 0 B · `/api/price-lists`

### finanzas · fria
- 23 ms · 0 B · `/api/orders?filtro=todos`
- 21 ms · 0 B · `/api/finance`
- 16 ms · 0 B · `/api/products?limit=500`
- 14 ms · 0 B · `/api/users`
- 10 ms · 0 B · `/api/notifications`

### finanzas · caliente
- 23 ms · 0 B · `/api/products?limit=500`
- 22 ms · 0 B · `/api/orders?filtro=todos`
- 20 ms · 0 B · `/api/finance`
- 19 ms · 0 B · `/api/users`
- 18 ms · 0 B · `/api/inventory-branches`

### finanzas · segunda
- 23 ms · 0 B · `/api/orders?filtro=todos`
- 21 ms · 0 B · `/api/products?limit=500`
- 21 ms · 0 B · `/api/finance`
- 19 ms · 0 B · `/api/users`
- 18 ms · 0 B · `/api/inventory-branches`

Repetidas: /api/finance ×2, /api/cash ×2

