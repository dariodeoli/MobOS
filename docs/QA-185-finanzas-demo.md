# QA #185 — Recorrido funcional de Finanzas en producción

- **Superficie:** `https://app.moboss.online/demo` (demo aislada en el
  navegador; versión observada: v1.0.126).
- **Método:** Playwright (`scripts/qa-185-finanzas-demo.mjs`), contexto limpio,
  1440×900 y 390×844, con captura por paso y monitoreo de consola y red.
- **Evidencia cruda:** `docs/qa/185/resultados.json` (16 pasos) y capturas
  `docs/qa/185/*.jpg`.
- **Alcance:** cuentas de cobro (alta contextual + nombre automático), medios
  (efectivo multi-moneda, transferencia + documento, tarjeta/procesadoras, Pix,
  USDT - Cripto, canje), conciliación, caja/auditoría de efectivo y seguro.
  No se usó ninguna sesión real.

## Verificado en verde

| Punto | Resultado observado | Captura |
| --- | --- | --- |
| Entrada a la demo | Perfil Dueño abre el panel; Finanzas visible | `01`, `02` |
| Cuentas demo | 5 cuentas ficticias (Caja Gs/USD, transferencia, tarjeta, canje) | `03` |
| Efectivo contextual | Solo nombre, moneda (Gs/USD/otra) y estado; sin banco, titular, documento, número, comisión ni acreditación | `04` |
| Efectivo multi-moneda | Nombre automático `Efectivo Gs` → `Efectivo USD` → `Efectivo ARS` al cambiar moneda/etiqueta | `05` |
| Efectivo guardado | Alta confirmada en la tabla | `06` |
| Transferencia contextual | Campos banco/titular/documento/número; nombre incremental `Banco Itaú Paraguay` → `… - Darío Deoli` → `… - Cuenta 1234` | `07` |
| Transferencia guardada | Fila con titular visible | `08` |
| Tarjeta | Procesadoras `Bancard`, `Dinelco`, `UPay`, `Pix`, `Otra…`; comisión 3% y acreditación 2 días con toggles; nombre `Bancard` | `09`, `10` |
| Pix | Moneda fija `BRL · Reales` (sin selector), llave Pix; nombre `Pix - Darío Deoli` | `11` |
| USDT - Cripto | Moneda fija `USD`, referencia de billetera; nombre `USDT - Darío Deoli` | `12` |
| Canje | Referencia/valor; nombre `Canje` | `13` |
| Alta de todos los medios | 11 cuentas en la tabla, sin mezclar campos entre medios | `14`, `15` |
| Edición | Campos precargados (procesadora, comisión, acreditación) y nombre manual conservado | `16` |
| Móvil 390 px | Sin desborde horizontal (`0 px`); plantillas y tabla se adaptan con scroll interno | `17` |
| Caja (demo) | Turno abierto, esperado `Gs 7.400.000`, cierre por denominaciones y diferencia al cierre | `19`, `20` |
| Resumen y Ganancias | Facturado y desglose de ganancia visibles con datos demo | `24`, `25` |

## Hallazgos

### 1. (Funcional · demo) El seguro de ventas se puede configurar, pero guardar falla con "Falta sesión"

- **Pasos:** `/demo` → Dueño → Configuración → Negocio → activar *Seguro de
  ventas* (propone 25%) → **Guardar seguro**.
- **Observado:** aparece el aviso de modo demo y a continuación `Falta sesión.`
  (el guardado hace `PATCH /api/account`, que en demo no tiene sesión real).
- **Esperado:** como en otras superficies de la demo, el panel podría quedar
  deshabilitado con una nota ("no disponible en la demo") o simular el guardado
  local, sin invitar a una acción que siempre falla.
- **Severidad:** baja (solo demo). **Capturas:** `21`, `22`, `23`.

### 2. (Visual · demo) La caja demo arranca "Abierta" pero dice "Sin apertura"

- **Pasos:** `/demo` → Dueño → Finanzas → Caja.
- **Observado:** Estado **Abierta** con la leyenda **Sin apertura**; el saldo
  esperado (`Gs 7.400.000`) sí incluye la apertura de `Gs 500.000`.
- **Causa:** el seed demo (`src/lib/demoCash.js`) crea la sesión con
  `openedAt: null` y `status: 'OPEN'`; la UI muestra "Sin apertura" cuando
  `openedAt` es nulo.
- **Esperado:** coherencia entre estado, leyenda y saldo (por ejemplo,
  `openedAt` con la fecha de la demo).
- **Severidad:** baja (solo demo). **Captura:** `19`.

### 3. (Cobertura · funcional) Conciliación no se puede recorrer en la demo

- **Pasos:** `/demo` → Finanzas → Conciliación.
- **Observado:** "Conciliación no está disponible en la demo." (por diseño).
- **Impacto:** el recorrido pedido de conciliación (ingresos por cuenta/medio/
  procesadora, lotes y diferencias) no se puede ejercitar sin una tienda real.
- **Sugerencia:** datos demo de solo lectura para el resumen y los grupos (sin
  permitir conciliar), o mantenerlo documentado como límite de la demo.
- **Captura:** `18`.

### 4. (Cobertura · funcional) Auditoría de caja no aparece en la demo

- **Pasos:** `/demo` → Finanzas → Caja → final de la página.
- **Observado:** no se renderizan "Auditoría de medios" ni "Auditoría de
  efectivo"; tampoco hay flujo de apertura (el turno demo viene abierto).
- **Impacto:** la auditoría de efectivo (#161) y la conciliación por medios no
  se pueden verificar en la demo.
- **Capturas:** `19`, `20`.

### 5. (Técnico menor) Ruido de consola y red en la demo

- **Observado:** 34 respuestas `401` a la API real (`presence`,
  `presence/heartbeat`, `notifications`, `credits`, `print/printers`, avatar,
  `account`, invitaciones) y 3 pedidos a `http://127.0.0.1:17890/health`
  (agente de impresión local) con `ERR_CONNECTION_REFUSED`.
- **Impacto:** solo ruido en consola; la demo funciona. Se puede silenciar con
  `isDemoRuntime` para que la consola quede limpia.
- **No es un hallazgo de seguridad** (no hay sesión real ni datos expuestos).

### Nota: efecto del seguro en el margen

El cálculo (`costo real = costo + seguro`) es del backend y no se puede
ejercitar en la demo; la fórmula y su prioridad (producto → cliente → empresa)
están cubiertas por los tests de #162 (`backend/tests/finance-insurance.test.ts`)
y visibles en la ayuda del panel (`22`).

## Clasificación

| # | Tipo | Dónde | Sev. |
| --- | --- | --- | --- |
| 1 | Funcional | Demo (seguro) | Baja |
| 2 | Visual | Demo (caja) | Baja |
| 3 | Cobertura | Demo (conciliación) | Media (QA) |
| 4 | Cobertura | Demo (auditoría) | Media (QA) |
| 5 | Técnico | Demo (consola/red) | Baja |

Sin hallazgos de seguridad en el recorrido.
