# Mapa de la app MobOS (índice)

> Índice de navegación y estructura. El detalle campo por campo de Configuración vive en **[`MAPA-CONFIG.md`](MAPA-CONFIG.md)**.
> Relevado el 25/09/2026 sobre `origin/main`. Fuentes: `src/App.jsx`, `src/pages/PanelVendedor.jsx`, `src/lib/rutas.js`, `src/lib/roles.js`.

## Los tres mundos (por host)
1. **Landing** (`moboss.online`) → marketing y `/status`.
2. **Portal de clientes** (`clientes.moboss.online`) → páginas por token.
3. **App** (resto de hosts) → panel por rol + públicas tokenizadas.

## Menú del panel (estado actual, #251)
- **Dueño/Admin**
  - **Inicio**: Inicio `/resumen` (alias `/inicio`)
  - **Vender**: POS `/pos` · Pedidos `/pedidos` · Cotizaciones `/cotizaciones` · Promociones `/promociones` · Plantillas `/plantillas`
  - **Clientes**: Clientes `/clientes`
  - **Inventario**: Productos `/productos` · Unidades `/inventario/unidades` · Compras `/compras` · Traslados y tránsito `/inventario/traslados` · Precios `/precios` · Lista por modelo `/celulares` · Comparador `/comparador`
  - **Operación**: Delivery `/delivery` · Taller y garantías `/servicio` (pestañas Todo/Tablero/Servicio/Garantías; `/garantias` abre Garantías) · Trade-In `/trade-in` · Autorizaciones `/autorizaciones` · Tablero de operaciones `/ops` (fuera del panel, con su propio shell)
  - **Finanzas**: Finanzas `/finanzas` (Caja, Gastos, Bancos, Conciliación, Créditos, Cuotas, Comisiones, Publicidad)
  - **Análisis**: Análisis `/analisis` (Reportes, Ganancias, Ganadores, Asistente)
  - **Configuración**: Configuración `/configuracion` (7 secciones) · Ayuda `/ayuda/ayuda`
- **Vendedor/Gerente/Cajera**: Vender (POS · Mis pedidos · Cotizaciones · Promociones · Plantillas) · Clientes · Inventario (Productos · Precios) · Operación (Delivery · Trade-In · Ayuda)
- **Técnico**: Operación → Taller y garantías (`/servicio`, `/garantias`) · Ayuda
- **Repartidor**: Mis repartos · Rendiciones
- **Móvil/shell**: bottom bar por rol; menú de tres puntos; buscador (Ctrl+K); notificaciones; tema; chip de usuario (PIN/bloquear).

## Configuración (`/configuracion`, solo dueño) — **7 secciones**
- **Mi cuenta**: perfil, preferencias, bloqueo, notificaciones, sesiones.
- **Organización**: datos, identidad/logo, legales, tiendas y sucursales, numeración, archivar.
- **Equipo y acceso**: integrantes, invitaciones, roles y permisos, horarios, PIN, metas y comisiones.
- **Comercial**: listas de precios, precios por cantidad, seguro, límites, fidelización y mora.
- **Seguridad y auditoría**: reauth, sesiones, uso del equipo, exportación, archivar/eliminar.
- **Dispositivos**: impresoras, puentes, preferencias del dispositivo.
- **Sistema**: estado del sistema.

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
