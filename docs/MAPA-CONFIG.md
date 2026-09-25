# Configuración de MobOS — detalle campo por campo

> Relevado el 25/09/2026 sobre `origin/main`. Ruta base `/configuracion/:seccion?` (solo dueño). Grupos y orden: `Personas` (Equipo · Mi identidad · Roles y permisos) · `Negocio` (Negocio · Listas de precios · Sucursales) · `Seguridad` (Seguridad · Auditoría) · `Sistema` (Impresoras · Documentación · Preferencias · Estado del sistema).
> Patrón transversal: chip «Guardado…» o error donde iría el botón; si el backend pide reautenticación (403) aparece «Confirmá tu contraseña para guardar» → «Contraseña de la empresa» + «Verificar y guardar» (autorización 10 min) y el guardado sigue solo. Aplica a numeración, seguro, límites, datos de tienda, sucursal, sesiones, exportación y permisos.

## 1. Equipo y acceso (`/configuracion/equipo`) — `control/Vendedores.jsx` + `control/RolesPermisos.jsx`
- Encabezado: banners de aviso; «+ Invitar persona» (solo pantallas chicas).
- **Integrantes** (#253): pestañas «Activos (n)»/«Inactivos (n)»; por integrante: nombre editable en línea, correo, sucursal (o «Sin sucursal»), badge Activo/Inactivo, selector de rol, «Historial», «Horario» (con el resumen cargado en el `title` o «Sin horario: acceso libre»), «PIN» (oculto en demo), «Permisos» (oculto en demo/ADMIN), «Desactivar»/«Volver a activar», **meta diaria como chip** con % de cumplimiento, métricas «Hoy», «Comisión hoy», «Mes». Vacíos propios.
- **Metas y comisiones** (#253): una fila por integrante activo con «Meta diaria» editable, «Hoy», «Cumplimiento (%)», «Comisión hoy» y «Mes» (vendido + comisión del mes); incluye el «Historial mensual por vendedor» y el acceso «Reglas y liquidaciones →» (Finanzas → Comisiones).
- **Sumar integrante**: modos «Invitar por correo» / «Agregar directamente» (demo oculta modos); formulario: «Nombre», «Correo (opcional)», «Rol», «PIN temporal (4 a 6 dígitos)» + «Agregar», o «Enviar invitación». Aviso de invitación activa con «Reenviar invitación» / «Revocar invitación».
- **Historial mensual por vendedor** (si hay ventas): mes colapsable con «Vendido {total}»; filas con ventas y «Comisión {monto}».
- **Comisiones** (sesión real + dueño): «Ir a Finanzas → Comisiones».
- **Invitaciones** (sesión real): estado (Pendiente/Aceptada/Vencida/Revocada), rol, quién invitó y fechas; «Reenviar», «Invitar de nuevo» (vencidas), «Revocar».
- **Modales**: Permisos (checkboxes recortables del rol; «Restaurar todo el rol»), Horario de acceso (zona horaria + rangos con días Lu–Do y horas; «+ Rango»), Historial, PIN (generar aleatorio / definir manual; el PIN no se vuelve a mostrar), confirmaciones de desactivar/rol/revocar.

## 2. Mi identidad (`/configuracion/identidad`) — `MiIdentidad` (Config.jsx)
- Ficha «Identidad de la cuenta»: avatar, nombre, correo; lista con «Correo del dueño» e «ID del usuario» (cada uno con «Copiar»).
- Formulario «Tu nombre de vendedor»: «Nombre» (2–100) + «Guardar nombre» y chip de estado.

## 3. Roles y permisos (`/configuracion/roles`) — `control/RolesPermisos.jsx`
- Tiles por rol (preview v2): nombre, descripción, «x/6» y chips de dominios.
- Acordeón por rol: «Qué puede hacer» y «Qué no puede» (tarjetas con nombre y descripción).
- «Matriz de capacidades»: tabla por dominio (Panel, Ventas, Delivery, Catálogo y stock, Pagos, Servicio, Equipo y configuración) × rol (Dueño, Gerente, Vendedor, Cajera, Técnico, Repartidor) con ✓/×. Solo lectura.

## 4. Negocio (`/configuracion/negocio`) — Config.jsx + `DatosPrivados.jsx`
- **Identificador de pedidos**: «Prefijo» (2–3 letras A-Z), «Número inicial» (hasta 8 dígitos), «Guardar numeración»; nota «Los pedidos ya creados conservan su número…».
- **Seguro y límites** (solo dueño): switch «Seguro de ventas» + «Porcentaje sobre el costo (%)» + «Guardar seguro»; y «Gasto sin autorización (Gs)», «Compra a crédito sin autorización (Gs)», «Bajo lista sin autorización (%)», «Fidelización: puntos por venta (%)», «Recargo por mora (% diario)» + «Guardar límites»; línea «Actual: …».
- **Logo de la empresa** (solo dueño): PNG 1024×1024 transparente ≤1 MiB; «Copiar prompt»; «Modo claro» = «Logo oscuro, para fondos claros» y «Modo oscuro» = «Logo claro, para fondos oscuros», con preview real, «Subir/Reemplazar», «Quitar» y modal de confirmación.
- **Datos privados** (solo dueño):
  - *Empresas/personas jurídicas*: «Nombre legal», «RUC» (RucField con extracción), «Dirección legal», «Notas»; «Guardar empresa»; lista con «Editar» / «Desactivar/Activar».
  - *Titulares/socios*: «Primer/Segundo/Tercer nombre», «Primer/Segundo apellido», «Cédula/RUC» (RucField, puede autocompletar), vista previa del nombre completo; «Guardar titular»; lista con «Editar» / «Desactivar/Activar».
- **Tiendas**: tienda actual (copiar ID), «Crear otra tienda», «Abandonar tienda» (palabra ABANDONAR), «Archivar tienda» (contraseña + ARCHIVAR, 30 días).
- **Invitaciones pendientes** (si hay): tienda, invitador/rol/vencimiento, «Aceptar» + PIN propio.
- **Identidad de la cuenta**: «Mi foto» (con recorte) + «Datos de la tienda»: «Nombre de la tienda», «Correo de la empresa», «Dirección», «Ciudad» (autocompleta departamento), «Teléfono» (código país), «RUC» (con extractor); «Restablecer» / «Guardar cambios»; ficha con «ID de la tienda» y copiar.

## 5. Listas de precios (`/configuracion/precios`) — `control/Precios.jsx`
- Reglas: en demo o sin permiso (dueño/ADMIN/GERENTE) se reemplaza por avisos. Prioridad en venta: **escalón por cantidad > lista del cliente > mayorista > minorista > USD**.
- **Listas de precios**: «+ Nueva lista»; fila: nombre, Activa/Inactiva, «n ítems» + primeros 3; acciones «Editar», «Desactivar/Activar», «Eliminar» (borrado lógico, auditado).
- **Precios por cantidad**: «Producto» (ProductCombobox con búsqueda al servidor); escalones con «Desde» (≥2) y «Precio unitario» + «Quitar escalón» / «+ Escalón» + «Guardar escalones» (reescribe los ítems de todas las listas de ese producto). Vacío: «Sin escalones…».
- **Modal Nueva/Editar lista**: «Nombre», switch «Lista activa», ítems con «Tipo de ítem» (Producto/Categoría), selector de producto o categoría, «Porcentaje» (0–100, descuento o recargo), «+ Ítem», «Quitar ítem»; «Guardar lista»; errores de validación propios.
- **Modal de borrado**: «¿Eliminar {lista}?» → los clientes vuelven a minorista/mayorista; auditoría.

## 6. Sucursales (`/configuracion/sucursales`)
- **Sucursales** (dueño): «+ Nueva sucursal»; fila: nombre, ciudad·departamento·dirección·teléfono·@instagram, Activa/Inactiva, «Editar», «Desactivar/Reactivar»; formulario: «Nombre», «Teléfono (opcional)» (código país), «Instagram (opcional)», «Ciudad» (con departamento), «Dirección (opcional)»; «Crear sucursal» / «Guardar cambios».
- **Tiendas**: mismo bloque que 4.5.

## 7. Seguridad (`/configuracion/seguridad`)
- **Sesión activa**: avatar/nombre + badges empresa/sucursal/rol.
- **Confirmar identidad**: «Contraseña de la empresa» + «Verificar contraseña» → «Acciones sensibles habilitadas hasta …» (10 min).
- **Sesiones activas**: «Actualizar», «Cerrar mi cuenta» (palabra CERRAR + contraseña); fila: usuario o «Acceso de empresa», «Este dispositivo», rol·deviceId·última actividad, «Revocar».
- **Uso del equipo** (dueño): últimos 30 días por persona (en línea, rol, sesiones, tiempo activo y detalle inicio→fin), «Actualizar».
- **Exportación básica**: «Descargar mis datos» (JSON sin credenciales/PIN/tokens/adjuntos).
- **Archivar empresa**: «Motivo del archivado (mínimo 10 caracteres)» + «Archivar empresa» (RESTORE en 30 días).
- **Eliminar empresa definitivamente** (dueño): contraseña + palabra ELIMINAR.
- Diálogos: «¿Cerrar tu cuenta?», «¿Revocar esta sesión?», «¿Archivar esta empresa?».
- En demo: `DemoNoDisponible`.

## 8. Auditoría (`/configuracion/historial`)
- Real (`Auditoria.jsx`): filtros «Filtrar por área» (Pedidos, Inventario, Promociones, Clientes, Pagos, Caja y finanzas, Compras, Garantías, Servicio técnico, Cotizaciones, Trade-In, Equipo, Sesiones, Impresiones), «Filtrar por fecha» (Hoy/Esta semana/Este mes), «Filtrar por actor», buscador («Acción, IMEI, pedido, impresora…»), «Exportar CSV», «Actualizar»; tabla Acción/Actor/Área/Detalle/Fecha con detalle expandible y JSON crudo; «Cargar más» (50 por página).
- Demo (`Historial.jsx`): buscador + chips «Todo / Cargas / Ediciones / Borrados» y lista local.

## 9. Impresoras (`/configuracion/impresoras`) — `control/Impresoras.jsx`
- Encabezado: «Actualizar estado», «Guía de impresión», «Agregar impresora».
- **Impresora por tipo de documento**: última usada por tipo (Comprobante, Nota de entrega, Remisión, Recibo, Proforma, Etiquetas, Cierre de caja, Resumen del día, Verificación IMEI, Informe, Certificado, Constancia…) + «Olvidar».
- **Estado del sistema**: tiles «Computadora puente» (gestionar puentes, dirección local), «Impresora predeterminada», «Cola» (pendientes/fallidos; «Ver cola», «Reintentar fallidos», «Limpiar fallidos»), «Mi equipo»; «Diagnóstico de red», «Reparar conexión», «Exportar diagnóstico» y panel con método/IP/puerto/TCP/CUPS/transporte/error.
- **Cobertura por sucursal**: alerta de sucursal sin puente; tile por sucursal con puente(s) e impresoras.
- **Grilla**: por impresora nombre, badges (Predeterminada/Desactivada/estado vivo), método/ancho/copias/ubicación, última prueba; acciones «Imprimir prueba», «Editar», «Diagnóstico», «Ver actividad», «Predeterminada», «Duplicar», «Desactivar/Activar», «Eliminar».
- **Comparar impresoras** (sesión real): hasta 3, «Enviar prueba a todas», tabla de tiempos + «Ganadora».
- **Panel de impresiones** (sesión real): rango 24 h/7 d/30 d + impresora; gráficos por hora, latencia y éxito.
- **Actividad de impresión**: filtros (rango, tipo, CSV), tabla con fecha/usuario/impresora/transporte/tiempos/puente/validación/resultado + «Confirmar en papel» (número secreto) y detalle expandible.
- **Equipos con acceso**: sesiones activas en verde (últimos 15 min).
- **Modales**: Agregar/Editar impresora (Identificación/Conexión CUPS·LAN/Formato/Agente), Probar (tipos de prueba + vista previa + número secreto), Puentes (crear/revocar, código de vinculación de un solo uso), Cola (pendientes del agente / en curso / fallidos), Guía de impresión (modos, instalación, problemas, mantenimiento).
- En demo: todo ficticio, banner fijo, sin comparar/panel.

## 10. Documentación (`/configuracion/documentacion`)
- Buscador (ignora acentos) + chips por módulo (POS, Pedidos, Clientes, Inventario, Garantías, Servicio Técnico, Equipo, Finanzas, Impresión, Configuración, Operación).
- 49 fichas: título, módulo, ubicación, explicación y botón «Ir» a la pantalla.

## 11. Preferencias (`/configuracion/preferencias`) — `app/Preferencias.jsx`
- «Bloqueo por inactividad» — select: «1 minuto», «5 minutos», «10 minutos» (por defecto), «15 minutos», «30 minutos».
- «Notificaciones» — checkbox «Mostrar el aviso de novedades: pedidos, aprobaciones, comentarios y menciones.» (activado por defecto).
- Se guardan **en el navegador, por usuario** (`mobos:preferencias:<userId>`, o `:anon`), nunca viajan a la empresa; se aplican al instante (evento `mobos:preferencias`); el **tema claro/oscuro no está acá** (está en el topbar/menú lateral).

## 12. Estado del sistema (`/configuracion/sistema`) — `control/EstadoSistema.jsx`
- **Chequeos**: «Copiar informe», «Actualizar», badges (versión, «n chequeos · fecha», «a revisar», «con error»); lista con «En orden» / «A revisar» / «Con error», incluye «Impresión (este equipo)».
- **Sincronización**: tarjetas «Puentes», «Impresoras», «Cola de impresión», «Correo saliente»; paneles «Últimos webhooks de AEX» y «Errores recientes (N h)»; avisos por fallos de impresión, correos y reservas vencidas.
- **Cola de impresión**: filtro por impresora; pendientes con tipo/referencia/estado/usuario/impresora/puente/fecha/intentos/error; «Cancelar seleccionados» / «Cancelar todos» (dueño/ADMIN/GERENTE); «Recientes con problema».
- En demo: `DemoNoDisponible`.
