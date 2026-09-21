# QA #194 — Finanzas en modo demo (sin API real)

- **Superficie:** `/demo` (local y producción) con datos ficticios aislados en el
  navegador; sin sesión real.
- **Recorrido reproducible:** `scripts/qa-194-demo-finanzas.mjs` (Playwright,
  1440×900 y 390×844) contra `QA_BASE_URL` (por defecto `http://localhost:5215`).
- **Evidencia:** `docs/qa/194/resultados.json` + capturas `docs/qa/194/*.jpg`
  (12 capturas, 5 pasos en verde).
- **Pruebas automáticas:** `e2e/demo-finanzas.spec.js` (4 tests, proyecto
  `core`) + unit de los módulos demo (`demoConciliacion`, `demoAuditoria`,
  `demoTenant`, `aplicarSeguro`).

## Verificado en verde

| Frente | Resultado | Captura |
| --- | --- | --- |
| Cuentas y medios | Alta contextual (Efectivo solo nombre/moneda/estado; transferencia banco/titular/documento/número; tarjeta procesadora + comisión/acreditación) y nombre automático; nada pega a la API | `03`, `04` |
| Caja | Turno abierto con apertura (`Turno de …`, sin "Sin apertura"), cierre por denominaciones y esperado `Gs 7.400.000` | `05` |
| Caja · entradas por medio | `Entradas por medio de pago` con los cobros ficticios del día (Efectivo `Gs 6.900.000`, Transferencia `Gs 30.000`) | `06` |
| Caja · auditoría de efectivo | Operaciones del rango con pedido/cliente/vendedor, marca verificada/pendiente/con diferencia y observación; las marcas quedan en el navegador | `06` |
| Conciliación | Grupos por cuenta/medio/procesadora, pagos ítem por ítem con pedido, lote conciliado con diferencia (`Gs -100.000`) y trazabilidad "Ver pedido" | `07`, `08`, `09` |
| Seguro y margen | Guardado local sin "Falta sesión"; el resultado de Ganancias cambia al aplicar 25% y aparece la insignia "Incluye seguro 25% (demo)" | `10`, `11`, `12` |

Ninguna pantalla de Finanzas mostró `Falta sesión` ni consultó endpoints de
finanzas reales (`/api/account`, `/api/finance*`, `/api/cash*`, `/api/credits`
quedaron fuera del tráfico del recorrido).

## Hallazgos

1. **(Pendiente · compartido) El shell sigue llamando a la API real en demo.**
   Con el recorrido completo quedan 401 de `presence` + `presence/heartbeat`,
   `users/demo-user/avatar`, `print/printers` y `user-invitations/pending`
   (52 errores de consola en total). El criterio de #194 pide consola sin
   errores de red reales: es de los dominios de presencia/notificaciones
   (PLT), impresión (PRN) y Equipo (PLT/DSN). Finanzas ya no aporta llamadas.
2. **(Nota · follow-up) Otros bloques de Configuración en demo** (perfil de la
   tienda, logo, archivar empresa) siguen yendo contra la API real si se usan.
   Los ajustes listados en #194 (límites, seguro, numeración) ya se simulan;
   el resto es candidato a un barrido por dominio.

## Cambios de código (Refs #194)

- `src/lib/demoTenant.js`: ajustes ficticios del tenant (seguro, límites,
  numeración) en `localStorage`.
- `src/lib/demoConciliacion.js`: conciliación ficticia con el contrato del
  endpoint real (grupos, ítems, lotes, diferencia) y lote simulado con la
  misma regla de una sola cuenta.
- `src/lib/demoAuditoria.js`: entradas por medio y auditoría de efectivo
  ficticias, con marcas locales.
- `Config.jsx`: en demo carga una empresa ficticia (sin `GET /api/account`) y
  guarda seguro/límites/numeración en el navegador con aviso.
- `Conciliacion.jsx`, `AuditoriaMedios.jsx`, `AuditoriaEfectivo.jsx`: datos
  ficticios en demo en lugar de ocultarse.
- `Ganancias.jsx` + `utils/ganancias.js` + `CalendarioGanancias.jsx`: el
  seguro se aplica al costo real (`costo + %`) en la demo.
- `Resumen.jsx`: no consulta créditos en demo.
