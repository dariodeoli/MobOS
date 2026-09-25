# Auditoría de performance (#247)

Fecha: 2026-09-25T15:31:41.970Z · CPU throttle 4x · 3 repeticiones (mediana)

| Pantalla | Carga | Listo (ms) | DOMContentLoaded | Load | API (n, ms prom) | Scripts (n, KB) |
| --- | --- | --- | --- | --- | --- | --- |
| inventario | fria | **778** | 185 | 189 | 9, 191 | 50, 322 |
| inventario | caliente | **476** | 75 | 75 | 9, 160 | 50, 15 |
| inventario | segunda | **639** | 89 | 90 | 15, 188 | 50, 15 |
| pos | fria | **1013** | 274 | 280 | 10, 160 | 51, 319 |
| pos | caliente | **470** | 64 | 67 | 10, 162 | 51, 15 |
| pos | segunda | **626** | 98 | 99 | 10, 232 | 51, 15 |
| pedidos | fria | **1076** | 225 | 226 | 9, 163 | 44, 276 |
| pedidos | caliente | **432** | 65 | 65 | 9, 167 | 44, 13 |
| pedidos | segunda | **648** | 97 | 98 | 9, 190 | 44, 13 |
| clientes | fria | **1061** | 191 | 196 | 13, 240 | 45, 280 |
| clientes | caliente | **434** | 68 | 68 | 13, 210 | 45, 13 |
| clientes | segunda | **587** | 89 | 89 | 13, 199 | 45, 13 |
| finanzas | fria | **508** | 251 | 255 | 9, 148 | 36, 250 |
| finanzas | caliente | **279** | 65 | 66 | 9, 136 | 36, 11 |
| finanzas | segunda | **354** | 91 | 91 | 9, 108 | 36, 11 |

## APIs más lentas por pantalla (primera corrida de cada combinación)

### inventario · fria
- 54 ms · 0 B · `/api/presence/heartbeat`
- 50 ms · 0 B · `/api/notifications`
- 36 ms · 0 B · `/api/presence`
- 30 ms · 0 B · `/api/orders?filtro=todos`
- 22 ms · 0 B · `/api/products?limit=500`

### inventario · caliente
- 28 ms · 0 B · `/api/notifications`
- 27 ms · 0 B · `/api/presence/heartbeat`
- 26 ms · 0 B · `/api/presence`
- 25 ms · 0 B · `/api/orders?filtro=todos`
- 20 ms · 0 B · `/api/inventory-units?view=removed`

Repetidas: /api/inventory-units ×2

### inventario · segunda
- 19 ms · 0 B · `/api/inventory-units?view=removed`
- 19 ms · 0 B · `/api/transfers`
- 19 ms · 0 B · `/api/inventory-reservations`
- 17 ms · 0 B · `/api/notifications`
- 16 ms · 0 B · `/api/orders?filtro=todos`

Repetidas: /api/inventory-units ×2

### pos · fria
- 29 ms · 0 B · `/api/orders?filtro=todos`
- 20 ms · 0 B · `/api/products?limit=500`
- 19 ms · 0 B · `/api/users`
- 15 ms · 0 B · `/api/notifications`
- 14 ms · 0 B · `/api/presence/heartbeat`

### pos · caliente
- 33 ms · 0 B · `/api/notifications`
- 32 ms · 0 B · `/api/presence/heartbeat`
- 29 ms · 0 B · `/api/presence`
- 28 ms · 0 B · `/api/orders?filtro=todos`
- 26 ms · 0 B · `/api/products?limit=500`

### pos · segunda
- 25 ms · 0 B · `/api/orders?filtro=todos`
- 24 ms · 0 B · `/api/products?limit=500`
- 14 ms · 0 B · `/api/auth/me`
- 14 ms · 0 B · `/api/notifications`
- 12 ms · 0 B · `/api/users`

### pedidos · fria
- 29 ms · 0 B · `/api/orders?filtro=todos`
- 27 ms · 0 B · `/api/products?limit=500`
- 24 ms · 0 B · `/api/notifications`
- 23 ms · 0 B · `/api/users`
- 23 ms · 0 B · `/api/presence/heartbeat`

Repetidas: /api/orders ×2

### pedidos · caliente
- 25 ms · 0 B · `/api/orders?filtro=todos`
- 23 ms · 0 B · `/api/products?limit=500`
- 21 ms · 0 B · `/api/notifications`
- 20 ms · 0 B · `/api/presence/heartbeat`
- 19 ms · 0 B · `/api/orders?filtro=activos&limit=50`

Repetidas: /api/orders ×2

### pedidos · segunda
- 44 ms · 0 B · `/api/orders?filtro=todos`
- 32 ms · 0 B · `/api/products?limit=500`
- 28 ms · 0 B · `/api/users`
- 27 ms · 0 B · `/api/inventory-branches`
- 25 ms · 0 B · `/api/presence/heartbeat`

Repetidas: /api/orders ×2

### clientes · fria
- 41 ms · 0 B · `/api/message-templates`
- 41 ms · 0 B · `/api/customers?orden=actividad&limit=50`
- 34 ms · 0 B · `/api/price-lists`
- 34 ms · 0 B · `/api/follow-ups?due=today`
- 31 ms · 0 B · `/api/customers/summary`

### clientes · caliente
- 20 ms · 0 B · `/api/customers?orden=actividad&limit=50`
- 20 ms · 0 B · `/api/message-templates`
- 17 ms · 0 B · `/api/price-lists`
- 16 ms · 0 B · `/api/follow-ups?due=today`
- 16 ms · 0 B · `/api/customers/summary`

### clientes · segunda
- 20 ms · 0 B · `/api/orders?filtro=todos`
- 17 ms · 0 B · `/api/products?limit=500`
- 16 ms · 0 B · `/api/customers?orden=actividad&limit=50`
- 14 ms · 0 B · `/api/users`
- 14 ms · 0 B · `/api/inventory-branches`

### finanzas · fria
- 31 ms · 0 B · `/api/notifications`
- 28 ms · 0 B · `/api/presence/heartbeat`
- 25 ms · 0 B · `/api/finance`
- 23 ms · 0 B · `/api/orders?filtro=todos`
- 20 ms · 0 B · `/api/products?limit=500`

### finanzas · caliente
- 21 ms · 0 B · `/api/orders?filtro=todos`
- 20 ms · 0 B · `/api/products?limit=500`
- 20 ms · 0 B · `/api/finance`
- 18 ms · 0 B · `/api/notifications`
- 17 ms · 0 B · `/api/users`

Repetidas: /api/finance ×2

### finanzas · segunda
- 18 ms · 0 B · `/api/orders?filtro=todos`
- 17 ms · 0 B · `/api/products?limit=500`
- 17 ms · 0 B · `/api/finance`
- 16 ms · 0 B · `/api/users`
- 15 ms · 0 B · `/api/inventory-branches`

