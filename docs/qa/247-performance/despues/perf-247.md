# Auditoría de performance (#247)

Fecha: 2026-09-23T18:09:53.830Z · CPU throttle 4x · 3 repeticiones (mediana)

| Pantalla | Carga | Listo (ms) | DOMContentLoaded | Load | API (n, ms prom) | Scripts (n, KB) |
| --- | --- | --- | --- | --- | --- | --- |
| inventario | fria | **2041** | 359 | 379 | 22, 1228 | 25, 487 |
| inventario | caliente | **3059** | 109 | 109 | 22, 1063 | 25, 7 |
| inventario | segunda | **1669** | 96 | 97 | 21, 1242 | 25, 7 |
| pos | fria | **1019** | 210 | 215 | 13, 262 | 20, 435 |
| pos | caliente | **701** | 68 | 68 | 13, 358 | 20, 6 |
| pos | segunda | **846** | 95 | 96 | 13, 328 | 20, 6 |
| clientes | fria | **1026** | 286 | 291 | 18, 426 | 20, 435 |
| clientes | caliente | **724** | 68 | 69 | 18, 534 | 20, 6 |
| clientes | segunda | **1274** | 105 | 106 | 18, 447 | 20, 6 |
| finanzas | fria | **1728** | 266 | 271 | 21, 553 | 20, 435 |
| finanzas | caliente | **632** | 97 | 98 | 15, 514 | 20, 6 |
| finanzas | segunda | **595** | 97 | 98 | 11, 498 | 20, 6 |

## APIs más lentas por pantalla (primera corrida de cada combinación)

### inventario · fria
- 505 ms · 0 B · `/api/fx`
- 125 ms · 0 B · `/api/inventory-units?`
- 125 ms · 0 B · `/api/stock-alerts?branchId=e2e-branch-1`
- 123 ms · 0 B · `/api/payment-accounts`
- 114 ms · 0 B · `/api/inventory-units?view=removed`

Repetidas: /api/products ×3, /api/inventory-branches ×2, /api/inventory-units ×2

### inventario · caliente
- 108 ms · 0 B · `/api/products?limit=200`
- 108 ms · 0 B · `/api/products?limit=200&cursor=cmudttsxu004pqrjhaopagn55`
- 80 ms · 0 B · `/api/stock-alerts?branchId=e2e-branch-1`
- 76 ms · 0 B · `/api/inventory-units?`
- 76 ms · 0 B · `/api/inventory-units?view=removed`

Repetidas: /api/products ×3, /api/inventory-branches ×2, /api/inventory-units ×2

### inventario · segunda
- 121 ms · 0 B · `/api/presence/heartbeat`
- 114 ms · 0 B · `/api/products?limit=200&cursor=cmudttsxu004pqrjhaopagn55`
- 109 ms · 0 B · `/api/notifications`
- 100 ms · 0 B · `/api/payment-accounts`
- 92 ms · 0 B · `/api/stock-alerts?branchId=e2e-branch-1`

Repetidas: /api/products ×3, /api/inventory-units ×2

### pos · fria
- 47 ms · 0 B · `/api/orders?filtro=todos`
- 44 ms · 0 B · `/api/products?limit=200&cursor=cmudttsxu004pqrjhaopagn55`
- 31 ms · 0 B · `/api/products?limit=200`
- 29 ms · 0 B · `/api/finance`
- 26 ms · 0 B · `/api/users`

Repetidas: /api/products ×3

### pos · caliente
- 100 ms · 0 B · `/api/products?limit=200&cursor=cmudttsxu004pqrjhaopagn55`
- 39 ms · 0 B · `/api/orders?filtro=todos`
- 37 ms · 0 B · `/api/products?limit=200`
- 30 ms · 0 B · `/api/finance`
- 28 ms · 0 B · `/api/inventory-branches`

Repetidas: /api/products ×3

### pos · segunda
- 138 ms · 0 B · `/api/products?limit=200&cursor=cmudttsxu004pqrjhaopagn55`
- 34 ms · 0 B · `/api/products?limit=200`
- 32 ms · 0 B · `/api/orders?filtro=todos`
- 27 ms · 0 B · `/api/finance`
- 26 ms · 0 B · `/api/users`

Repetidas: /api/products ×3

### clientes · fria
- 58 ms · 0 B · `/api/message-templates`
- 50 ms · 0 B · `/api/customers?orden=actividad&limit=50`
- 36 ms · 0 B · `/api/orders?filtro=todos`
- 36 ms · 0 B · `/api/products?limit=200&cursor=cmudttsxu004pqrjhaopagn55`
- 34 ms · 0 B · `/api/price-lists`

Repetidas: /api/products ×3

### clientes · caliente
- 109 ms · 0 B · `/api/products?limit=200&cursor=cmudttsxu004pqrjhaopagn55`
- 62 ms · 0 B · `/api/products?limit=200`
- 61 ms · 0 B · `/api/orders?filtro=todos`
- 54 ms · 0 B · `/api/finance`
- 36 ms · 0 B · `/api/users`

Repetidas: /api/products ×3

### clientes · segunda
- 46 ms · 0 B · `/api/customers?orden=actividad&limit=50`
- 46 ms · 0 B · `/api/message-templates`
- 38 ms · 0 B · `/api/products?limit=200`
- 36 ms · 0 B · `/api/notifications`
- 35 ms · 0 B · `/api/orders?filtro=todos`

Repetidas: /api/products ×3

### finanzas · fria
- 62 ms · 0 B · `/api/cash/audit-operations?from=2026-09-16&to=2026-09-23&branchId=e2e-branch-1`
- 58 ms · 0 B · `/api/cash?sesiones=1&from=2026-08-25&to=2026-09-23&branchId=e2e-branch-1`
- 55 ms · 0 B · `/api/cash/audit?branchId=e2e-branch-1&date=2026-09-23`
- 50 ms · 0 B · `/api/orders?filtro=todos`
- 49 ms · 0 B · `/api/products?limit=200`

Repetidas: /api/products ×3, /api/finance ×2, /api/cash ×2

### finanzas · caliente
- 85 ms · 0 B · `/api/products?limit=200&cursor=cmudttsxu004pqrjhaopagn55`
- 53 ms · 0 B · `/api/products?limit=200`
- 49 ms · 0 B · `/api/orders?filtro=todos`
- 42 ms · 0 B · `/api/cash?branchId=e2e-branch-1`
- 39 ms · 0 B · `/api/combos`

Repetidas: /api/products ×3, /api/finance ×2

### finanzas · segunda
- 199 ms · 0 B · `/api/products?limit=200`
- 128 ms · 0 B · `/api/orders?filtro=todos`
- 81 ms · 0 B · `/api/users`
- 81 ms · 0 B · `/api/finance`
- 81 ms · 0 B · `/api/inventory-branches`

