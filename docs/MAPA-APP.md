# Mapa de la app MobOS (índice)

> Índice de navegación y estructura. El detalle campo por campo de Configuración vive en **[`MAPA-CONFIG.md`](MAPA-CONFIG.md)**.
> Relevado el 25/09/2026 sobre `origin/main`. Fuentes: `src/App.jsx`, `src/pages/PanelVendedor.jsx`, `src/lib/rutas.js`, `src/lib/roles.js`.

## Los tres mundos (por host)
1. **Landing** (`moboss.online`) → marketing y `/status`.
2. **Portal de clientes** (`clientes.moboss.online`) → páginas por token.
3. **App** (resto de hosts) → panel por rol + públicas tokenizadas.

## Menú del panel (estado actual)
- **Dueño/Admin**
  - **Operación**: POS `/pos` · Pedidos `/pedidos` · Delivery `/delivery` · Clientes `/clientes` · Promociones `/promociones` · Precios `/precios` · Cotizaciones `/cotizaciones` · Plantillas `/plantillas`
  - **Stock y servicio**: Inventario `/inventario` (Unidades, Taller, Conteos, Alertas, Reservas, Traslados, Vendidos, En tránsito, Ubicaciones, Compartido, Eliminados) · Compras `/compras` (+ Productos) · Trade-In `/trade-in` · Servicio y Garantías `/servicio` · `/garantias` · Autorizaciones `/autorizaciones`
  - **Negocio**: Resumen `/resumen` · Análisis `/analisis` (Reportes, Ganancias, Ganadores, Asistente) · Finanzas `/finanzas` (Caja, Gastos, Bancos, Conciliación, Créditos, Cuotas, Comisiones, Publicidad) · Configuración `/configuracion`
  - Fuera de menú: `/celulares`, `/comparador`
- **Vendedor/Gerente/Cajera**: POS · Mis pedidos · Delivery · Clientes · Productos · Promociones · Precios · Trade-In (cotizador) · Cotizaciones
- **Técnico**: Taller (`/servicio`, `/garantias`)
- **Repartidor**: Mis repartos · Rendiciones
- **Móvil/shell**: bottom bar por rol; menú de tres puntos; buscador (Ctrl+K); notificaciones; tema; chip de usuario (PIN/bloquear).

## Configuración (`/configuracion`, solo dueño) — **4 grupos, 12 pestañas**
- **Personas**: Equipo · Mi identidad · Roles y permisos
- **Negocio**: Negocio · Listas de precios · Sucursales
- **Seguridad**: Seguridad · Auditoría
- **Sistema**: Impresoras · Documentación · Preferencias · Estado del sistema

→ Detalle de cada pestaña (campos, acciones y condiciones): **[`MAPA-CONFIG.md`](MAPA-CONFIG.md)**.

## Páginas públicas (no son navegación de menú)
Portal: entrada · `/cuenta/:token` · `/portal/:token` · `/pedidos/:token` · `/carrito/:token` · `/garantia/:token` · `/u/:serial` · `/cotizacion/:token` · `/remito/:token`.
App: `/demo` · `/login` · `/restablecer-contrasena` · `/recuperar-empresa` · `/aceptar-invitacion` · `/verificar-correo` · `/ops` (+ `/ops-preview`).

## Compatibilidad (técnica, no navegación)
`/control/:tab` → canónico · `/pos/:vista` → slug nuevo · `/ventas` → `/pos` · `/tradein` → `/trade-in` · `/configuracion/impresion` → `/impresoras` · `/pedido|/p/:token` → `/pedidos/:token`.

## Referencias
Rutas canónicas `src/lib/rutas.js` · metadatos `src/lib/metadataPolicy.js` · roles `src/lib/roles.js` · ayuda por tema `control/Documentacion.jsx` · cheat-sheet de atajos `app/CheatSheetAtajos.jsx`.

## Reorganización en curso (aprobada)
Ver la propuesta de IA del 25/09: Configuración en 7 secciones (Mi cuenta · Organización · Equipo y acceso · Comercial · Seguridad y auditoría · Dispositivos · Sistema), menú principal nuevo (Inicio · Vender · Clientes · Inventario · Operación · Finanzas · Análisis · Configuración) y limpieza de duplicaciones (Tiendas/Sucursales, Mi identidad, Documentación→Ayuda, Servicio+Garantías→Taller, Impresoras vs Estado del sistema).
