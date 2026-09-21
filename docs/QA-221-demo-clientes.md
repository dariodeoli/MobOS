# #221 — Demo de Clientes con agregados como la cuenta real

En el demo, la lista y el perfil calculan los agregados **desde los pedidos
demo** con las mismas fórmulas que la cuenta real (sin API):

- `src/lib/customerAggregates.js`: `statsDePedidos` (lista) y
  `analiticaDePedidos` (ficha) — total, cantidad, última compra, ticket
  promedio, promedio mensual, frecuencia, antigüedad, meses/días de actividad y
  favoritos por producto/modelo/categoría. Con 4 tests unitarios.
- La lista usa las stats del API cuando existen y, en demo, las calcula de los
  pedidos; el tipo (mayorista/final) también sobrevive la proyección (antes se
  perdía y todas las filas salían “Cliente final” con Gs 0).
- La ficha: `buildDemoAnalytics` reemplazó los números fijos por el cálculo
  real; el “Total gastado” del Resumen ya no suma ventas canceladas (igual que
  la lista y la analítica, también en la cuenta real).
- Seeds demo enriquecidos: Lucía con 6 compras repartidas en ~2 años (incluye
  una cancelada que no cuenta), Distribuidora con 3 y Carlos con 2, con
  productos/modelos/categorías y seriales.

## Evidencia

- `qa221-lista-demo.png`: la fila muestra **Gs 7.750.000** y el teléfono +595.
- `qa221-estadisticas-demo.png`: **ticket promedio Gs 1.550.000**, favorito
  “iPhone 15 · 128 GB”, **frecuencia cada 172 días** y gasto por mes.
- e2e: `demo: ficha con deuda…` (demo) y `mini CRM de clientes` (real, la fila
  muestra el total de la venta creada).
