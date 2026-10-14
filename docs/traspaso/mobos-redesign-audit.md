# MobOS visual audit — production v1.0.225 (2026-10-13)

Screenshots + raw metrics: /var/folders/k_/kb6z6bgj5vl_80y4xt33krvh0000gn/T/mobos-audit/ (d-light-*, m-light-*, *-dark-*, metrics-*.json). Source paths relative to MobOS-pos/src. No horizontal page scroll anywhere; amounts complete except #30.

Already known (POS agent fixing): lone "Más" row, sparse product grid, split phone field, RUC result column, overlapping cart summary.

## Shell
1. alta · desktop · Pedidos, Inventario, Compras, Precios, Traslados, Config: full-width "Destinos de X" select repeats the active tab / Productos-Unidades switch; with kicker+H1+tab the same word appears 3–4×, ~110px lost (tabs end y=165, content y=275). AppShell.jsx:355-364, SectionSelector.jsx:20-24 (dropdownOnly visible at lg).
2. media · desktop · Finanzas/Análisis: second tab row starts 48px below the first; empty band. PanelVendedor.jsx:845,857, SectionSelector.jsx:15, AppShell.jsx:346-347.
3. media · mobile · all: fixed top block 108/844px (app bar 56 + branch/demo/"Cómo funciona" row 52). SelectorSucursal.jsx, AppShell.jsx:194,310.
4. media · desktop · Config: 7 sections only via dropdown (>6 forces dropdownOnly), ~1000px free. config/NavegacionConfig.jsx:8.

## Inicio / ops
5. baja · count badges contrast 3.2–3.4 light. Resumen.jsx ~713.
6. baja · Vendedor column truncates names while Nota has room. Resumen.jsx:707-760.
7. baja · "Para resolver hoy" rows indented 16px vs title; ~50px empty band. Resumen.jsx:47,468-472.
8. baja · mobile 2-option select 44px; "Hoy" 100×36.
9. baja · /ops "Datos reales" badge inside demo; mobile 4 stacked KPIs 113px, Actualizar 32px high, back link 16px. ops/TableroOps.jsx:65,115.

## POS (other)
10. media · "Nuevo producto" alone on its row + search on another: 3 rows before first card. venta/PasoProductos.jsx.
11. baja · "Cliente" twice; "Facturar a otro titular" 70px for one line. CheckoutCustomer.jsx.
12. baja · mobile "4 en stock" / "elegí la variante" possible 56×14 overlap (verify).

## Ventas
13. media · Cotizaciones "Más" is plain text 28×44 mobile; "Más estados" native select next to pills. SellerQuotes.jsx:450-454,593.
14. baja · Pedidos mobile: 2 selects both "Pedidos" + "Más filtros y orden". SellerOrders.jsx, AppShell.jsx:346-364.

## Stock
15. alta · Traslados (and other StockShell tabs): inventory toolbar (IMEI search, sort, list/grid, Productos/Unidades, + Recibir, Más) rendered where it doesn't apply; page 37% empty. stock/StockShell.jsx:41-72 (BarraModulo for every tab).
16. alta · mobile Unidades: 4 native selects stacked before first unit ("Inventario", "Unidades (IMEI)", "Recientes", "Inventario"); Traslados both as Stock area and inventory section; first unit at y≈436. StockShell.jsx:80-100, AppShell.jsx:346-364.
17. media · desktop Unidades: description truncated (424px text in 178px) with 700px free; 80px blank between select and bar; "Cambiar vista" clipped. StockShell.jsx:44, shared/BarraModulo.jsx.
18. baja · Traslados header "DESPACHÓ / RECIB…" truncated; columns end at 1220 of 1407. stock/TabTraslados.jsx:12.
19. baja · Compras inner "Compras | Productos" full-width strip (4th "Compras"); ~190px empty. control/Compras.jsx.
20. media · mobile targets <44: price list icons 36×36, Compras sort headers 20px high. Precios.jsx, Compras.jsx.
21. baja · Precios por cantidad: one 450px input, 800px empty; subtitle "2 items · Producto, Producto". Precios.jsx.
22. baja · Productos list SKU truncated. Inventario / stock/ListaStock.

## Finanzas
23. alta · desktop Caja > Auditoría de efectivo: Estado select overlaps Observación input by 22px in all rows; state shown twice (badge + select). AuditoriaEfectivo.jsx:128,137,148.
24. alta · mobile Caja Auditoría + Ventas por caja: min-w 52/54rem grids in overflow-x; only 3 columns visible; header "C."; names truncated. AuditoriaEfectivo.jsx:127-137, VentasPorCaja.jsx:19,76.
25. alta · mobile Bancos y cuentas: same horizontal-scroll table; names truncated to 14–73px. PaymentAccounts.jsx:22,356,376.
26. media · desktop Bancos: names/Datos truncated while Comisión/Descuento mostly "—"; bank repeated (logo + name). PaymentAccounts.jsx:22,360-380.
27. baja · Conciliación: collapsed "Cuentas del período" 85px; debug-like copy ("Lista: 22 pago(s) · Estado…", "Selección masiva: reemplaza…"); extra space "Gs -50.000". Conciliacion.jsx ~107-111.
28. media · mobile Reportes: 34/51 targets <44 (pager 28×28). Reportes.jsx.
29. baja · Reportes "Exportar CSV" 12px vs 14px siblings. Reportes.jsx:183.

## Configuración
30. alta · mobile Seguridad y auditoría: activity feed ellipsis hides amounts. Historial.jsx:143.
31. media · mobile Sistema: alert text and device names truncated. EstadoSistema.jsx, lib/demo/sistema.js.
32. media · mobile Dispositivos/Comercial: small targets (42×44, 36×36, links 15px high). Impresoras.jsx, Precios.jsx.
33. baja · Mi cuenta photo block cramped; columns uneven. cuenta/MiCuenta.jsx.
34. baja · Organización/Seguridad/Dispositivos/Sistema: 24–28% empty, single narrow column. control/config/*.

Counts: alta 7 (#1,15,16,23,24,25,30), media 10, baja 17.
