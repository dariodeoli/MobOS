# Auditoría de performance (#247)

Fecha: 2026-09-23T18:08:45.692Z · CPU throttle 4x · 3 repeticiones (mediana)

| Pantalla | Carga | Listo (ms) | DOMContentLoaded | Load | API (n, ms prom) | Scripts (n, KB) |
| --- | --- | --- | --- | --- | --- | --- |
| inventario | fria | **1816** | 273 | 279 | 22, 1142 | 9, 493 |
| inventario | caliente | **3059** | 161 | 161 | 22, 825 | 9, 3 |
| inventario | segunda | **1755** | 183 | 184 | 22, 869 | 9, 3 |
| pos | fria | **1079** | 300 | 305 | 13, 269 | 5, 444 |
| pos | caliente | **695** | 142 | 142 | 13, 253 | 5, 1 |
| pos | segunda | **874** | 175 | 176 | 13, 259 | 5, 1 |
| clientes | fria | **1127** | 280 | 281 | 18, 443 | 5, 444 |
| clientes | caliente | **1153** | 146 | 147 | 18, 368 | 5, 1 |
| clientes | segunda | **1280** | 175 | 176 | 18, 387 | 5, 1 |
| finanzas | fria | **534** | 191 | 195 | 11, 215 | 5, 444 |
| finanzas | caliente | **399** | 61 | 61 | 11, 199 | 5, 1 |
| finanzas | segunda | **537** | 177 | 177 | 11, 216 | 5, 1 |

## APIs más lentas por pantalla (primera corrida de cada combinación)

### inventario · fria
- 443 ms · 0 B · `/api/fx`
- 109 ms · 0 B · `/api/stock-alerts?branchId=e2e-branch-1`
- 108 ms · 0 B · `/api/inventory-units?view=removed`
- 106 ms · 0 B · `/api/suppliers`
- 106 ms · 0 B · `/api/payment-accounts`

Repetidas: /api/products ×3, /api/inventory-branches ×2, /api/inventory-units ×2

### inventario · caliente
- 72 ms · 0 B · `/api/payment-accounts`
- 72 ms · 0 B · `/api/stock-alerts?branchId=e2e-branch-1`
- 69 ms · 0 B · `/api/inventory-units?view=removed`
- 67 ms · 0 B · `/api/inventory-units?`
- 65 ms · 0 B · `/api/suppliers`

Repetidas: /api/products ×3, /api/inventory-branches ×2, /api/inventory-units ×2

### inventario · segunda
- 73 ms · 0 B · `/api/stock-alerts?branchId=e2e-branch-1`
- 68 ms · 0 B · `/api/inventory-units?`
- 67 ms · 0 B · `/api/inventory-units?view=removed`
- 67 ms · 0 B · `/api/suppliers`
- 66 ms · 0 B · `/api/fx`

Repetidas: /api/products ×3, /api/inventory-branches ×2, /api/inventory-units ×2

### pos · fria
- 42 ms · 0 B · `/api/products?limit=200`
- 36 ms · 0 B · `/api/orders?filtro=todos`
- 32 ms · 0 B · `/api/users`
- 32 ms · 0 B · `/api/finance`
- 22 ms · 0 B · `/api/notifications`

Repetidas: /api/products ×3

### pos · caliente
- 33 ms · 0 B · `/api/orders?filtro=todos`
- 33 ms · 0 B · `/api/products?limit=200`
- 26 ms · 0 B · `/api/users`
- 26 ms · 0 B · `/api/finance`
- 17 ms · 0 B · `/api/notifications`

Repetidas: /api/products ×3

### pos · segunda
- 38 ms · 0 B · `/api/products?limit=200&cursor=cmudttsxu004pqrjhaopagn55`
- 35 ms · 0 B · `/api/orders?filtro=todos`
- 28 ms · 0 B · `/api/products?limit=200`
- 24 ms · 0 B · `/api/finance`
- 23 ms · 0 B · `/api/users`

Repetidas: /api/products ×3

### clientes · fria
- 57 ms · 0 B · `/api/message-templates`
- 52 ms · 0 B · `/api/customers?orden=actividad&limit=50`
- 46 ms · 0 B · `/api/payment-accounts`
- 39 ms · 0 B · `/api/orders?filtro=todos`
- 35 ms · 0 B · `/api/price-lists`

Repetidas: /api/products ×3

### clientes · caliente
- 38 ms · 0 B · `/api/orders?filtro=todos`
- 35 ms · 0 B · `/api/products?limit=200`
- 33 ms · 0 B · `/api/products?limit=200&cursor=cmudttsxu004pqrjhaopagn55`
- 31 ms · 0 B · `/api/finance`
- 29 ms · 0 B · `/api/users`

Repetidas: /api/products ×3

### clientes · segunda
- 44 ms · 0 B · `/api/message-templates`
- 41 ms · 0 B · `/api/customers?orden=actividad&limit=50`
- 32 ms · 0 B · `/api/products?limit=200&cursor=cmudttsxu004pqrjhaopagn55`
- 29 ms · 0 B · `/api/orders?filtro=todos`
- 28 ms · 0 B · `/api/products?limit=200`

Repetidas: /api/products ×3

### finanzas · fria
- 30 ms · 0 B · `/api/products?limit=200&cursor=cmudttsxu004pqrjhaopagn55`
- 28 ms · 0 B · `/api/orders?filtro=todos`
- 26 ms · 0 B · `/api/products?limit=200`
- 23 ms · 0 B · `/api/finance`
- 14 ms · 0 B · `/api/users`

Repetidas: /api/products ×3

### finanzas · caliente
- 35 ms · 0 B · `/api/products?limit=200&cursor=cmudttsxu004pqrjhaopagn55`
- 34 ms · 0 B · `/api/orders?filtro=todos`
- 29 ms · 0 B · `/api/products?limit=200`
- 22 ms · 0 B · `/api/finance`
- 17 ms · 0 B · `/api/users`

Repetidas: /api/products ×3

### finanzas · segunda
- 34 ms · 0 B · `/api/products?limit=200&cursor=cmudttsxu004pqrjhaopagn55`
- 31 ms · 0 B · `/api/orders?filtro=todos`
- 26 ms · 0 B · `/api/products?limit=200`
- 25 ms · 0 B · `/api/finance`
- 20 ms · 0 B · `/api/notifications`

Repetidas: /api/products ×3

