# MobOS app-wide redesign plan (architect, 2026-10-13)

Base branch for batch 1: codex/ui-pos-redesign. Audit findings #1–34: ../mobos-redesign-audit.md (sibling file).
Owner decisions taken (owner gave design freedom): D1 Compras becomes a primary destination; D2 owner mobile bottom nav = Inicio · Vender · Ventas · Stock · Más (Finanzas under Más); D3 Clientes and Taller become primary for the owner.

Key facts: nav is presentation only — `PRIMARY_SECTIONS`/`CONTEXT_GROUPS` in src/lib/shellNavigation.js regroup role catalogs; `RUTA_DE_VISTA` and `accesibles` in src/pages/PanelVendedor.jsx decide access. GERENTE/VENDEDOR/CAJERA use SELLER_NAV; only esOwner gets OWNER_NAV. owncoding-ui v0.68.1 exports PageHeader, Subtabs, EmptyState, Badge, EstadoBadge/ChipEstado, ActionToolbar — wrap, don't reimplement.

## 1. Design rules (to write into docs/PANTALLAS.md)
1. Density: desktop rows 36px (px-3 py-2); 44px touch below lg. Body 13–14px; 12px only metadata, never actions.
2. Type: H1 22/28 semibold; section 16/24; body 14/20; meta 12/16; table header 10px uppercase. Amounts tabular-nums, right-aligned, always full (Gs. 12.500.000).
3. Spacing: 4/8/12/16/24/32 only; gutter 16 mobile / 24 desktop; header→content 12.
4. One page header: H1 = primary section, primary action of active tab on same row right; one SectionTabs row below. No kicker, no visible breadcrumb (keep `shell-breadcrumb` sr-only), no "Destinos de X" select. A word at most twice (H1 + active tab).
5. Max two nav levels: L1 shell SectionTabs; L2 segmented control inside the toolbar. Never a third tab row.
6. Tabs never a native select: below lg horizontal scroll strip of 44px tabs with edge fade; desktop inline, overflow into a measured "Más" popover (replaces the >6 → dropdown rule).
7. Toolbars belong to a tab (search, filters, view, primary, Más); tab without toolbar config renders none.
8. Tables ≥ md: grid table fitting 1280 without h-scroll. < md: card per row (title, meta, amount, status, actions in Más). No min-w + overflow-x tables below md. Update TABLAS.md §1.
9. Forms: composite values in one row with one border (prefix, input, trailing button). Label above, 44px, max 640px on desktop, two columns at lg.
10. One StatusChip reading src/lib/estados.js, tones ok/warn/bad/neutral, contrast ≥ 4.5 light/dark, w-fit. A status shown once.
11. Empty states: owncoding EmptyState (icon, one sentence, one action). No debug copy.
12. Mobile top chrome ≤ 64px: only app bar fixed (56 + safe area) with branch chip inside; demo notice + "Cómo funciona" become a one-line dismissible in-flow banner; bottom nav 56px.

## 2. IA (regroups existing ids only; routes/slugs unchanged; alias: `traslados` id renders /stock/traslados)
Owner sidebar (vender → cobrar → entregar → stock → caja):
- Inicio: Resumen · Operaciones (ops, flag)
- Vender: none (POS full width; Trade-In quote is a POS action)
- Ventas: Pedidos · Cotizaciones · Entregas (repartos) · Por aprobar (autorizaciones, count)
- Clientes: Clientes · Promociones · Plantillas
- Taller: Servicio · Garantías · Trade-In (tradein-admin)
- Stock: Unidades · Productos · Traslados · Control · Precios (Control L2: conteos, alertas, autorizaciones, taller, ubicaciones, compartido, reservas; Vendidos/Eliminados = Unidades filter; Precios L2: Lista por modelo, Comparador, Centro de Control)
- Compras: Compras · Por comprar · Centro · Preparar compra · Preparar lote · Recepción · Métricas
- Finanzas: Caja · Conciliación · Cuotas · Créditos · Gastos · Bancos y cuentas · Comisiones · Publicidad
- Análisis: Reportes · Ganancias · Ganadores · Asistente
Sidebar footer: branch, alerts, profile, Configuración, Ayuda. Configuración: desktop vertical sub-nav in page; mobile SectionTabs.
Owner mobile bottom nav: Inicio · Vender · Ventas · Stock · Más (sheet: Clientes, Taller, Compras, Finanzas, Análisis, Configuración, Ayuda).
GERENTE/VENDEDOR/CAJERA: Vender · Ventas (Mis pedidos, Cotizaciones, Entregas) · Clientes (Clientes, Promociones, Plantillas) · Stock (Productos, Precios). Cotizador inside Vender + /trade-in. Ayuda in profile. 4 bottom items, no Más.
TECNICO: Taller (Servicio · Garantías); no bottom nav with one section.
REPARTIDOR: Entregas (Mis repartos · Rendiciones).
Every id stays in its catalog; accesibles, deep links, DESTINO_LEGADO in rutas.js unchanged. Only projection files change: shellNavigation.js and e2e/helpers/shell-navigation.js SHELL_DESTINATIONS.

## 3. Shared blocks
- PageHeader: src/components/app/PageHeader.jsx (wraps owncoding PageHeader) — replaces AppShell.jsx:330-365.
- SectionTabs: src/components/app/SectionTabs.jsx (scroll strip / desktop Más popover; L2 segmented) — replaces SectionSelector.jsx, NavegacionConfig.jsx:8, PanelVendedor.jsx:845/857 inline selectors. Keep testids shell-contexto, shell-subcontexto, config-grupos.
- MobileAppBar + DemoBanner (app/DemoBanner.jsx) — AppShell.jsx:310-330, extra SelectorSucursal row.
- Toolbar: src/components/shared/Toolbar.jsx on owncoding ActionToolbar — BarraModulo.jsx becomes a re-export shim (keep barra-inventario testid).
- ResponsiveList: evolve shared/ListaDensa.jsx (columns + renderCard; grid ≥ md, cards < md; PieListado 44px pager).
- FieldRow/CompositeField: src/components/shared/FieldRow.jsx.
- KpiTile: Stat in ui/index.jsx:114 + compact variant.
- StatusChip: src/components/shared/StatusChip.jsx + src/lib/estados.js.
- Layout contract helper: e2e/frontend/helpers/layoutContract.js.

## 4. Shared acceptance QA-A (every unit, via layoutContract)
No h-scroll at 375/768/1280/1440 light+dark; fixed mobile chrome ≤ 64px; first content top ≤ 168px at 375×812 and ≤ 132px at 1440×900; <lg interactive ≥ 44×44 (inline text links excepted); no intersecting interactive boxes; amounts never cut (.tabular-nums scrollWidth ≤ clientWidth); contrast ≥ 4.5; Esc closes overlays.
Verification per unit: `npm run lint && npm test && npm run build && npx playwright test -c e2e/nav-v2.frontend.config.js` + the unit's DB specs (isolated MOBOS_E2E_*).

## 5. Batches
Batch 1 (foundation): 1A codex/ui-shell-ia (shellNavigation.js + test, AppShell, PageHeader, SectionTabs, NavegacionConfig, PanelVendedor inline selectors :845/:857 — catalogs untouched — e2e/helpers/shell-navigation.js clicks tabs, SHELL_DESTINATIONS, layoutContract, e2e/frontend/shell-layout.frontend.spec.js; closes #1 #2 #3 #4 #14, nav half of #16, #9 back link; tabs end ≤ y=110 at 1440; every catalog id reachable by clicking; aria-current both levels). 1B codex/ui-shared-blocks (Toolbar, ResponsiveList, FieldRow, StatusChip + estados.js, Stat compact, docs/PANTALLAS.md, TABLAS.md §1/§6, CAMPOS.md FieldRow, unit tests, preview spec 375/1280; BarraModulo shim only).
Batch 2 (on merged base): 2A codex/ui-stock (#15–22; first unit top ≤ 168 at 375; 0 native selects before first unit; Traslados without inventory toolbar), 2B codex/ui-finanzas (#23–29; no `min-w-[` below md; Estado/Observación no overlap; bank once; Reportes pager 44px; no debug copy), 2C codex/ui-ventas-inicio (#5–13; Más estados → chip overflow; Nuevo producto into search row; vendedor full name at 1280).
Batch 3: 3A codex/ui-config (#30–34), 3B QA re-audit, 3C cleanup (delete SectionSelector, BarraModulo shim).

## 6. Risks
- src/lib/e2eShellNavigation.test.js regex-parses OWNER_NAV etc. from PanelVendedor.jsx (format `['id', 'Label', 'icon']`, terminated by `\n]\n`): leave catalogs/format untouched. disenoReglas/objetosReglas/stockF4/contrasteTokens assert source patterns: update in same commit keeping intent, no assertion dropped.
- e2e/helpers/shell-navigation.js:97-167 uses selectOption on shell-contexto/shell-subcontexto (also nav-v2, finanzas-caja, admin.spec): centralize in helper (click tabs + Más popover), keep testids. Target data-testids and roles, never layout/text order.
- Words appearing once instead of 3–4×: `.first()`/`.nth()` locators may change meaning.
- Layout specs run on /demo (frontend-only); long names/amounts must come from lib/demo/* fixtures; `ZZ` prefix rule for new data.
- Batch 2 starts only after the 1A+1B merge is green. PanelVendedor.jsx belongs to 1A; line ~831 (Compras | Productos strip) handed to 2A.
