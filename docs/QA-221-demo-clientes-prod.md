# Verificación post-deploy #221 — Clientes en demo (v1.0.138)

Producción **v1.0.138** (= `main` en `fcf84fcb`), corrida headless contra la **demo pública**
(`/demo` → Dueño) con `node scripts/qa-221-clientes-produccion.mjs`.
Evidencia para **#221** (agregados de clientes en demo como la cuenta real).

> **Nota de versión:** la corrida original fue sobre **v1.0.137**; cuando el
> deploy **v1.0.138** quedó publicado se repitió completa sobre esa versión
> (mismos 8/8). El script es repetible y sella la versión desplegada:
> `node scripts/qa-221-clientes-produccion.mjs` (con `MOBOS_QA_URL`/`MOBOS_QA_OUT`).

- Capturas: `docs/QA-221-demo-clientes-prod/01…09*.jpg`
- Reporte crudo: `docs/QA-221-demo-clientes-prod/resultados.json`
  (pasos, agregados observados, versión y llamadas de red)
- La demo **no llamó al API real**: 0 requests a `api.moboss.online` en los 8
  pasos (todo sale del navegador).

## Recorrido verificado

| Paso | Resultado | Evidencia |
|---|---|---|
| Entrada anónima a `/demo` sin login, perfiles Vendedor/Dueño, aviso de datos ficticios y versión desplegada | ✅ **v1.0.138** | `01-demo-entrada.jpg` |
| Panel del Dueño en modo demo con el banner “Modo demo: datos ficticios…” | ✅ | `02-panel-dueno-demo.jpg` |
| **Listado de clientes con agregados**: Lucía con **5 pedidos** y **Gs 7.750.000** (la venta cancelada no cuenta) y teléfono `+595 981 123 456` | ✅ | `03-lista-clientes-agregados.jpg` |
| **Ficha → Resumen**: Total gastado **Gs 7.750.000**, Saldo pendiente **Gs 1.500.000** (Deuda), Órdenes activas 1, Última compra 9/9/2026, “Cliente desde 22/8/24, 20:32”, últimas órdenes **MOB-#0008** y MOB-#0005 | ✅ | `04-ficha-resumen.jpg` |
| **Pedidos asociados**: historial completo (MOB-#0008, MOB-#0005, MOB-#0002, MOB-#0031 **Cancelado**, MOB-#0012, MOB-#0003) y “Equipos con IMEI/serial” con el serial de la compra (356789012345678) y Verificación IMEI | ✅ | `05-pedidos-asociados.jpg` |
| **Estadísticas calculadas**: Compras **5**, Total gastado **Gs 7.750.000**, Ticket promedio **Gs 1.550.000**, Gasto por mes Gs 332.143, Frecuencia **Cada 172 días**, Primera/Última compra, favoritos por producto/modelo/categoría, meses y días de actividad, informe CSV | ✅ | `06-estadisticas.jpg` |
| **Portal del cliente (demo)**: QR y enlace local por token `/cuenta/demo-demo-cliente-lucia-rapido` (servido en `clientes.moboss.online`); el portal muestra el saldo **Gs 1.500.000** y el pedido MOB-#0008 | ✅ | `07-portal-qr.jpg` · `08-portal-cliente.jpg` |
| **WhatsApp**: menú de plantillas del cliente (las 3 de demo), vista previa con el nombre interpolado y `Abrir WhatsApp` → `https://wa.me/595981123456?text=…` | ✅ | `09-whatsapp-plantilla.jpg` |

## Hallazgos (mejoras de demo, no bloquean #221)

1. **La ficha cuenta 6 pedidos** (incluye la venta cancelada MOB-#0031) mientras
   el listado y las Estadísticas cuentan **5 compras**. Convivien dos criterios
   de “pedidos” en la misma pantalla.
2. **Aviso de la ficha contradictorio**: dice “No hay pedidos, pagos, deuda,
   cronología ni portal” y la ficha muestra todo eso (es el aviso genérico del
   modo demo).
3. **Aviso de Estadísticas desactualizado**: “se calculan con las ventas reales
   de la tienda” cuando, desde #221, salen de los pedidos demo del navegador.
4. **Favoritos con Gs 0**: los montos por producto/modelo/categoría muestran
   `N u. · Gs 0` porque los ítems de pedido demo no traen importe (las
   cantidades y el total sí son reales).
5. **Portal “Tienda demo”**: el portal del cliente en demo sigue con el nombre
   viejo; la tienda ficticia ya es **Aurora Móviles** (#222). El listado aún
   tiene una clienta con “(demo)” en el nombre (barrido en curso, #219).
6. **Plantilla demo de Clientes**: deja “Tu pedido  ya está…” (la variable de
   pedido no aplica a la ficha del cliente y queda un espacio doble).

## Cómo repetir

```bash
node scripts/qa-221-clientes-produccion.mjs            # producción
MOBOS_QA_URL=http://localhost:5249 node scripts/qa-221-clientes-produccion.mjs
MOBOS_QA_OUT=/tmp/qa221 node scripts/qa-221-clientes-produccion.mjs
```

Sale 1 si algún paso falla o si la demo toca el API real.
