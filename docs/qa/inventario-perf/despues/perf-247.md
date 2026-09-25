# Auditoría de performance (#247)

Fecha: 2026-09-25T05:14:16.166Z · CPU throttle 4x · 3 repeticiones (mediana)

| Pantalla | Carga | Listo (ms) | DOMContentLoaded | Load | API (n, ms prom) | Scripts (n, KB) |
| --- | --- | --- | --- | --- | --- | --- |
| inventario | fria | **2023** | 447 | 1064 | 12, 1741 | 227, 9861 |
| inventario | caliente | **1612** | 347 | 352 | 16, 978 | 227, 63 |
| inventario | segunda | **1865** | 407 | 510 | 18, 1056 | 227, 63 |
| pos | fria | **1444** | 421 | 700 | 11, 650 | 201, 8509 |
| pos | caliente | **1198** | 208 | 212 | 11, 626 | 201, 55 |
| pos | segunda | **1356** | 417 | 521 | 11, 584 | 201, 55 |
| pedidos | fria | **1889** | 418 | 683 | 12, 667 | 212, 8972 |
| pedidos | caliente | **1183** | 205 | 210 | 12, 615 | 212, 59 |
| pedidos | segunda | **1398** | 408 | 516 | 12, 618 | 212, 59 |
| clientes | fria | **1917** | 445 | 600 | 16, 1423 | 225, 9686 |
| clientes | caliente | **1358** | 214 | 220 | 16, 947 | 225, 62 |
| clientes | segunda | **1946** | 440 | 545 | 16, 1703 | 225, 62 |
| finanzas | fria | **1281** | 433 | 637 | 10, 927 | 211, 8947 |
| finanzas | caliente | **590** | 216 | 221 | 7, 482 | 145, 39 |
| finanzas | segunda | **868** | 388 | 524 | 10, 581 | 173, 47 |

## APIs más lentas por pantalla (primera corrida de cada combinación)

### inventario · fria
- 361 ms · 0 B · `/api/suppliers`
- 262 ms · 0 B · `/api/inventory-units?`
- 261 ms · 0 B · `/api/stock-locations`
- 256 ms · 0 B · `/api/notifications`
- 251 ms · 0 B · `/api/presence`

Repetidas: /api/presence/heartbeat ×2, /api/inventory-units ×2

### inventario · caliente
- 77 ms · 0 B · `/api/presence/heartbeat`
- 71 ms · 0 B · `/api/notifications`
- 70 ms · 0 B · `/api/presence/heartbeat`
- 65 ms · 0 B · `/api/presence`
- 64 ms · 0 B · `/api/orders?filtro=todos`

Repetidas: /api/presence/heartbeat ×2

### inventario · segunda
- 109 ms · 0 B · `/api/inventory-units?view=removed`
- 108 ms · 0 B · `/api/fx`
- 106 ms · 0 B · `/api/suppliers`
- 105 ms · 0 B · `/api/stock-locations`
- 95 ms · 0 B · `/api/transfers`

Repetidas: /api/presence/heartbeat ×2, /api/inventory-units ×2

### pos · fria
- 114 ms · 0 B · `/api/presence/heartbeat`
- 106 ms · 0 B · `/api/presence/heartbeat`
- 81 ms · 0 B · `/api/notifications`
- 74 ms · 0 B · `/api/presence`
- 62 ms · 0 B · `/api/combos`

Repetidas: /api/presence/heartbeat ×2

### pos · caliente
- 75 ms · 0 B · `/api/presence/heartbeat`
- 74 ms · 0 B · `/api/notifications`
- 74 ms · 0 B · `/api/presence/heartbeat`
- 66 ms · 0 B · `/api/orders?filtro=todos`
- 65 ms · 0 B · `/api/presence`

Repetidas: /api/presence/heartbeat ×2

### pos · segunda
- 78 ms · 0 B · `/api/orders?filtro=todos`
- 70 ms · 0 B · `/api/users`
- 70 ms · 0 B · `/api/inventory-branches`
- 67 ms · 0 B · `/api/presence/heartbeat`
- 66 ms · 0 B · `/api/presence/heartbeat`

Repetidas: /api/presence/heartbeat ×2

### pedidos · fria
- 106 ms · 0 B · `/api/presence/heartbeat`
- 106 ms · 0 B · `/api/presence/heartbeat`
- 104 ms · 0 B · `/api/notifications`
- 79 ms · 0 B · `/api/presence`
- 50 ms · 0 B · `/api/products?limit=500`

Repetidas: /api/orders ×2, /api/presence/heartbeat ×2

### pedidos · caliente
- 72 ms · 0 B · `/api/orders?filtro=todos`
- 71 ms · 0 B · `/api/products?limit=500`
- 66 ms · 0 B · `/api/notifications`
- 65 ms · 0 B · `/api/presence/heartbeat`
- 64 ms · 0 B · `/api/presence/heartbeat`

Repetidas: /api/orders ×2, /api/presence/heartbeat ×2

### pedidos · segunda
- 66 ms · 0 B · `/api/presence/heartbeat`
- 61 ms · 0 B · `/api/presence/heartbeat`
- 58 ms · 0 B · `/api/products?limit=500`
- 58 ms · 0 B · `/api/orders?filtro=todos`
- 56 ms · 0 B · `/api/users`

Repetidas: /api/orders ×2, /api/presence/heartbeat ×2

### clientes · fria
- 335 ms · 0 B · `/api/message-templates`
- 241 ms · 0 B · `/api/customers?orden=actividad&limit=50`
- 233 ms · 0 B · `/api/price-lists`
- 233 ms · 0 B · `/api/follow-ups?due=today`
- 230 ms · 0 B · `/api/customers/summary`

Repetidas: /api/presence/heartbeat ×2

### clientes · caliente
- 87 ms · 0 B · `/api/message-templates`
- 74 ms · 0 B · `/api/presence/heartbeat`
- 71 ms · 0 B · `/api/customers?orden=actividad&limit=50`
- 67 ms · 0 B · `/api/notifications`
- 66 ms · 0 B · `/api/presence`

Repetidas: /api/presence/heartbeat ×2

### clientes · segunda
- 103 ms · 0 B · `/api/message-templates`
- 82 ms · 0 B · `/api/notifications`
- 79 ms · 0 B · `/api/presence/heartbeat`
- 76 ms · 0 B · `/api/presence/heartbeat`
- 76 ms · 0 B · `/api/customers?orden=actividad&limit=50`

Repetidas: /api/presence/heartbeat ×2

### finanzas · fria
- 278 ms · 0 B · `/api/finance`
- 276 ms · 0 B · `/api/orders?filtro=todos`
- 274 ms · 0 B · `/api/products?limit=500`
- 256 ms · 0 B · `/api/users`
- 129 ms · 0 B · `/api/presence/heartbeat`

Repetidas: /api/presence/heartbeat ×2

### finanzas · caliente
- 71 ms · 0 B · `/api/finance`
- 68 ms · 0 B · `/api/orders?filtro=todos`
- 60 ms · 0 B · `/api/users`
- 60 ms · 0 B · `/api/inventory-branches`
- 56 ms · 0 B · `/api/products?limit=500`

### finanzas · segunda
- 67 ms · 0 B · `/api/presence/heartbeat`
- 66 ms · 0 B · `/api/orders?filtro=todos`
- 65 ms · 0 B · `/api/finance`
- 65 ms · 0 B · `/api/presence/heartbeat`
- 63 ms · 0 B · `/api/notifications`

Repetidas: /api/presence/heartbeat ×2

