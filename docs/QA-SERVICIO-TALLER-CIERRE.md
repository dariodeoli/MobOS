# Cierre · Servicio / Taller (dominio)

Cierre del dominio **Servicio/Taller + Garantías** en `slot/clientes`, con la
composición compacta (#256) y el barrido funcional completo. Producción todavía
sirve **v1.0.190**; esta rama queda **lista para integrar** (merge limpio).

## Qué incluye el dominio (todo en esta rama)

| Pieza | Estado |
|---|---|
| **Taller** (órdenes de servicio): barra `barra-taller` con acciones (Actualizar · Catálogo · + Nueva orden) y resumen Facturado/Costos/Utilidad con alcance | ✅ |
| **Garantías**: barra `barra-garantias` (Exportar CSV · Nuevo caso), filtros y búsqueda en su fila, resumen con alcance | ✅ |
| **Listado unificado** (Todo): resumen Registros/En taller/Garantías/Desde garantía con alcance | ✅ |
| **Tablero** por etapas: barra `barra-tablero` con el selector órdenes/garantías en el contexto | ✅ |
| **Pipeline** del taller/garantías (avanzar etapa desde la tarjeta) y tokens v2 | ✅ (regresión) |
| **Cliente ocasional en órdenes de taller** (la ficha del cliente se vincula al pedido; garantías→taller conservan historial) | ✅ (regresión) |

## Evidencia

- Barrido del dominio en una corrida: `servicio-tecnico` + `qa-241-servicio-v2`
  + `qa-241-servicio-pipeline` + `qa-fin-repuestos-taller`
  + `qa-240-garantia-portal` → **21/21 verde**.
- Composición compacta: `qa-256-composicion` **4/4** (incluye `/servicio` en el
  control de desborde 390/1280).
- Capturas: `docs/QA-256-servicio-taller/{01-taller,02-garantias}.png`.
- Doc de la unidad: `docs/QA-256-servicio-taller.md`.

## Verificación en producción

Pendiente de integración. Queda listo el verificador de los flujos de
#260/#273 (`scripts/qa-260-273-produccion.mjs`, solo lectura, con
`MOBOS_QA_STORAGE_STATE`); el dominio Taller/Garantías ya se audita con
`qa-241-servicio-v2` (AA/overflow) y se puede repetir post-deploy.

## Pendientes declarados (fuera de este cierre)

- El **certificado** impreso del equipo y el **informe** son de PRN (#240).
- La verificación en producción de #260/#273 requiere la sesión real y el
  deploy; el script falla en voz alta con `MOBOS_QA_EXIGIR_DEPLOY=1`.
