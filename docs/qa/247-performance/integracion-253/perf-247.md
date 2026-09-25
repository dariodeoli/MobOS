# Auditoría de performance (#247)

Fecha: 2026-09-25T19:59:19.187Z · CPU throttle 4x · 3 repeticiones (mediana)

| Pantalla | Carga | Listo (ms) | DOMContentLoaded | Load | API (n, ms prom) | Scripts (n, KB) |
| --- | --- | --- | --- | --- | --- | --- |
| inventario | fria | **1264** | 252 | 257 | 14, 256 | 52, 331 |
| inventario | caliente | **920** | 79 | 79 | 9, 224 | 52, 15 |
| inventario | segunda | **968** | 92 | 93 | 9, 176 | 52, 15 |
| pos | fria | **1004** | 251 | 252 | 10, 119 | 52, 325 |
| pos | caliente | **557** | 68 | 68 | 10, 139 | 52, 15 |
| pos | segunda | **714** | 90 | 91 | 10, 124 | 52, 15 |
| pedidos | fria | **1062** | 203 | 204 | 9, 111 | 45, 282 |
| pedidos | caliente | **472** | 67 | 68 | 9, 177 | 45, 13 |
| pedidos | segunda | **656** | 96 | 97 | 9, 133 | 45, 13 |
| clientes | fria | **1029** | 272 | 277 | 13, 250 | 45, 283 |
| clientes | caliente | **495** | 66 | 66 | 13, 240 | 45, 13 |
| clientes | segunda | **674** | 95 | 96 | 13, 281 | 45, 13 |
| finanzas | fria | **488** | 184 | 184 | 9, 245 | 36, 253 |
| finanzas | caliente | **293** | 67 | 68 | 9, 208 | 36, 11 |
| finanzas | segunda | **392** | 91 | 91 | 9, 165 | 36, 11 |

## APIs más lentas por pantalla (primera corrida de cada combinación)

### inventario · fria
- 57 ms · 0 B · `/api/inventory-units?view=removed`
- 55 ms · 0 B · `/api/inventory-reservations`
- 54 ms · 0 B · `/api/transfers`
- 43 ms · 0 B · `/api/suppliers`
- 35 ms · 0 B · `/api/notifications`

Repetidas: /api/inventory-units ×2

### inventario · caliente
- 114 ms · 0 B · `/api/products?limit=500`
- 68 ms · 0 B · `/api/inventory-units?`
- 52 ms · 0 B · `/api/notifications`
- 47 ms · 0 B · `/api/presence/heartbeat`
- 39 ms · 0 B · `/api/orders?filtro=todos`

### inventario · segunda
- 35 ms · 0 B · `/api/products?limit=500`
- 23 ms · 0 B · `/api/orders?filtro=todos`
- 16 ms · 0 B · `/api/inventory-units?`
- 10 ms · 0 B · `/api/notifications`
- 9 ms · 0 B · `/api/users`

### pos · fria
- 28 ms · 0 B · `/api/orders?filtro=todos`
- 26 ms · 0 B · `/api/products?limit=500`
- 20 ms · 0 B · `/api/notifications`
- 19 ms · 0 B · `/api/presence/heartbeat`
- 17 ms · 0 B · `/api/presence`

### pos · caliente
- 54 ms · 0 B · `/api/products?limit=500`
- 22 ms · 0 B · `/api/orders?filtro=todos`
- 13 ms · 0 B · `/api/notifications`
- 12 ms · 0 B · `/api/presence/heartbeat`
- 10 ms · 0 B · `/api/inventory-branches`

### pos · segunda
- 27 ms · 0 B · `/api/products?limit=500`
- 20 ms · 0 B · `/api/orders?filtro=todos`
- 11 ms · 0 B · `/api/notifications`
- 9 ms · 0 B · `/api/users`
- 9 ms · 0 B · `/api/presence/heartbeat`

### pedidos · fria
- 23 ms · 0 B · `/api/products?limit=500`
- 18 ms · 0 B · `/api/orders?filtro=todos`
- 11 ms · 0 B · `/api/orders?filtro=activos&limit=50`
- 10 ms · 0 B · `/api/notifications`
- 9 ms · 0 B · `/api/presence`

Repetidas: /api/orders ×2

### pedidos · caliente
- 34 ms · 0 B · `/api/products?limit=500`
- 22 ms · 0 B · `/api/orders?filtro=todos`
- 16 ms · 0 B · `/api/users`
- 11 ms · 0 B · `/api/inventory-branches`
- 11 ms · 0 B · `/api/orders?filtro=activos&limit=50`

Repetidas: /api/orders ×2

### pedidos · segunda
- 36 ms · 0 B · `/api/products?limit=500`
- 20 ms · 0 B · `/api/orders?filtro=todos`
- 16 ms · 0 B · `/api/notifications`
- 14 ms · 0 B · `/api/presence`
- 13 ms · 0 B · `/api/presence/heartbeat`

Repetidas: /api/orders ×2

### clientes · fria
- 29 ms · 0 B · `/api/price-lists`
- 29 ms · 0 B · `/api/customers?orden=actividad&limit=50`
- 28 ms · 0 B · `/api/follow-ups?due=today`
- 28 ms · 0 B · `/api/message-templates`
- 24 ms · 0 B · `/api/orders?filtro=todos`

### clientes · caliente
- 25 ms · 0 B · `/api/products?limit=500`
- 19 ms · 0 B · `/api/orders?filtro=todos`
- 14 ms · 0 B · `/api/customers?orden=actividad&limit=50`
- 13 ms · 0 B · `/api/message-templates`
- 12 ms · 0 B · `/api/inventory-branches`

### clientes · segunda
- 50 ms · 0 B · `/api/products?limit=500`
- 30 ms · 0 B · `/api/customers?orden=actividad&limit=50`
- 30 ms · 0 B · `/api/message-templates`
- 20 ms · 0 B · `/api/orders?filtro=todos`
- 19 ms · 0 B · `/api/price-lists`

### finanzas · fria
- 32 ms · 0 B · `/api/finance`
- 31 ms · 0 B · `/api/orders?filtro=todos`
- 29 ms · 0 B · `/api/products?limit=500`
- 25 ms · 0 B · `/api/users`
- 11 ms · 0 B · `/api/inventory-branches`

### finanzas · caliente
- 41 ms · 0 B · `/api/products?limit=500`
- 40 ms · 0 B · `/api/orders?filtro=todos`
- 35 ms · 0 B · `/api/finance`
- 26 ms · 0 B · `/api/inventory-branches`
- 16 ms · 0 B · `/api/users`

### finanzas · segunda
- 32 ms · 0 B · `/api/products?limit=500`
- 21 ms · 0 B · `/api/orders?filtro=todos`
- 18 ms · 0 B · `/api/users`
- 18 ms · 0 B · `/api/finance`
- 17 ms · 0 B · `/api/inventory-branches`

