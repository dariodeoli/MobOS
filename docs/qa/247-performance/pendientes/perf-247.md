# Auditoría de performance (#247)

Fecha: 2026-09-23T20:32:15.856Z · CPU throttle 4x · 2 repeticiones (mediana)

| Pantalla | Carga | Listo (ms) | DOMContentLoaded | Load | API (n, ms prom) | Scripts (n, KB) |
| --- | --- | --- | --- | --- | --- | --- |
| inventario | fria | **2067** | 288 | 301 | 20, 1173 | 65, 376 |
| inventario | caliente | **2414** | 178 | 180 | 20, 790 | 65, 19 |
| inventario | segunda | **1592** | 93 | 94 | 20, 894 | 65, 19 |
| pos | fria | **1285** | 467 | 470 | 11, 158 | 51, 313 |
| pos | caliente | **657** | 66 | 66 | 11, 297 | 51, 15 |
| pos | segunda | **836** | 93 | 93 | 11, 299 | 51, 15 |
| pedidos | fria | **1096** | 228 | 231 | 12, 190 | 58, 336 |
| pedidos | caliente | **672** | 59 | 59 | 12, 316 | 58, 17 |
| pedidos | segunda | **798** | 89 | 89 | 12, 312 | 58, 17 |
| clientes | fria | **993** | 258 | 262 | 16, 257 | 63, 361 |
| clientes | caliente | **646** | 61 | 61 | 16, 293 | 63, 18 |
| clientes | segunda | **805** | 90 | 91 | 16, 437 | 63, 18 |
| finanzas | fria | **1266** | 180 | 182 | 20, 797 | 59, 337 |
| finanzas | caliente | **459** | 161 | 161 | 9, 365 | 59, 17 |
| finanzas | segunda | **499** | 90 | 91 | 12, 295 | 59, 17 |

## APIs más lentas por pantalla (primera corrida de cada combinación)

### inventario · fria
- 444 ms · 0 B · `/api/fx`
- 125 ms · 0 B · `/api/inventory-units?view=removed`
- 124 ms · 0 B · `/api/stock-alerts?branchId=e2e-branch-1`
- 122 ms · 0 B · `/api/suppliers`
- 122 ms · 0 B · `/api/payment-accounts`

Repetidas: /api/products ×2, /api/inventory-branches ×2, /api/inventory-units ×2

### inventario · caliente
- 205 ms · 0 B · `/api/products?limit=500`
- 63 ms · 0 B · `/api/stock-alerts?branchId=e2e-branch-1`
- 62 ms · 0 B · `/api/inventory-units?view=removed`
- 57 ms · 0 B · `/api/inventory-units?`
- 54 ms · 0 B · `/api/suppliers`

Repetidas: /api/products ×2, /api/inventory-branches ×2, /api/inventory-units ×2

### inventario · segunda
- 150 ms · 0 B · `/api/products?limit=500`
- 65 ms · 0 B · `/api/inventory-units?`
- 62 ms · 0 B · `/api/stock-alerts?branchId=e2e-branch-1`
- 62 ms · 0 B · `/api/payment-accounts`
- 61 ms · 0 B · `/api/inventory-units?view=removed`

Repetidas: /api/products ×2, /api/inventory-branches ×2, /api/inventory-units ×2

### pos · fria
- 32 ms · 0 B · `/api/products?limit=500`
- 32 ms · 0 B · `/api/orders?filtro=todos`
- 19 ms · 0 B · `/api/users`
- 14 ms · 0 B · `/api/notifications`
- 14 ms · 0 B · `/api/presence/heartbeat`

Repetidas: /api/products ×2

### pos · caliente
- 156 ms · 0 B · `/api/products?limit=500`
- 30 ms · 0 B · `/api/orders?filtro=todos`
- 25 ms · 0 B · `/api/notifications`
- 24 ms · 0 B · `/api/presence/heartbeat`
- 20 ms · 0 B · `/api/presence`

Repetidas: /api/products ×2

### pos · segunda
- 137 ms · 0 B · `/api/products?limit=500`
- 32 ms · 0 B · `/api/orders?filtro=todos`
- 21 ms · 0 B · `/api/notifications`
- 20 ms · 0 B · `/api/presence/heartbeat`
- 20 ms · 0 B · `/api/combos`

Repetidas: /api/products ×2

### pedidos · fria
- 32 ms · 0 B · `/api/products?limit=500`
- 25 ms · 0 B · `/api/orders?filtro=todos`
- 21 ms · 0 B · `/api/users`
- 21 ms · 0 B · `/api/products?limit=500&cursor=cmudtndr9006k0jjhl4fd0n10`
- 20 ms · 0 B · `/api/orders?filtro=activos&limit=50`

Repetidas: /api/products ×2, /api/orders ×2

### pedidos · caliente
- 150 ms · 0 B · `/api/products?limit=500`
- 40 ms · 0 B · `/api/orders?filtro=todos`
- 17 ms · 0 B · `/api/orders?filtro=activos&limit=50`
- 14 ms · 0 B · `/api/notifications`
- 14 ms · 0 B · `/api/presence/heartbeat`

Repetidas: /api/products ×2, /api/orders ×2

### pedidos · segunda
- 195 ms · 0 B · `/api/products?limit=500`
- 44 ms · 0 B · `/api/orders?filtro=todos`
- 23 ms · 0 B · `/api/products?limit=500&cursor=cmudtndr9006k0jjhl4fd0n10`
- 22 ms · 0 B · `/api/users`
- 17 ms · 0 B · `/api/orders?filtro=activos&limit=50`

Repetidas: /api/products ×2, /api/orders ×2

### clientes · fria
- 32 ms · 0 B · `/api/orders?filtro=todos`
- 26 ms · 0 B · `/api/message-templates`
- 25 ms · 0 B · `/api/products?limit=500`
- 25 ms · 0 B · `/api/customers?orden=actividad&limit=50`
- 20 ms · 0 B · `/api/users`

Repetidas: /api/products ×2

### clientes · caliente
- 118 ms · 0 B · `/api/products?limit=500`
- 37 ms · 0 B · `/api/orders?filtro=todos`
- 19 ms · 0 B · `/api/users`
- 16 ms · 0 B · `/api/inventory-branches`
- 16 ms · 0 B · `/api/message-templates`

Repetidas: /api/products ×2

### clientes · segunda
- 199 ms · 0 B · `/api/products?limit=500`
- 34 ms · 0 B · `/api/customers?orden=actividad&limit=50`
- 30 ms · 0 B · `/api/message-templates`
- 29 ms · 0 B · `/api/orders?filtro=todos`
- 22 ms · 0 B · `/api/follow-ups?due=today`

Repetidas: /api/products ×2

### finanzas · fria
- 162 ms · 0 B · `/api/cash/audit-operations?from=2026-09-16&to=2026-09-23&branchId=e2e-branch-1`
- 159 ms · 0 B · `/api/print/printers`
- 158 ms · 0 B · `/api/cash/audit?branchId=e2e-branch-1&date=2026-09-23`
- 151 ms · 0 B · `/api/cash?sesiones=1&from=2026-08-25&to=2026-09-23&branchId=e2e-branch-1`
- 101 ms · 0 B · `/api/attachments?entity=CASH_SESSION&entityId=7788fff0-ed75-40e7-80a1-87860a765cee`

Repetidas: /api/products ×2, /api/finance ×2, /api/cash ×2

### finanzas · caliente
- 195 ms · 0 B · `/api/products?limit=500`
- 38 ms · 0 B · `/api/orders?filtro=todos`
- 29 ms · 0 B · `/api/users`
- 29 ms · 0 B · `/api/finance`
- 20 ms · 0 B · `/api/inventory-branches`

### finanzas · segunda
- 69 ms · 0 B · `/api/products?limit=500`
- 33 ms · 0 B · `/api/orders?filtro=todos`
- 27 ms · 0 B · `/api/finance`
- 25 ms · 0 B · `/api/users`
- 25 ms · 0 B · `/api/inventory-branches`

Repetidas: /api/products ×2, /api/finance ×2

