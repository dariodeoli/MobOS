# Responsividad de Taller, Productos y Comparador — #396 / #370 / #448

Alcance de esta unidad: Taller, Productos/Stock, Comparador, Cuotas y comprobación del aviso demo y navegación de Configuración. Abastecimiento está en otra unidad. No modifica importes, permisos, API, base de datos ni impresión.

## Cambios

- Taller conserva una sola barra de herramientas: Todo, Tablero y Garantías están en Más acciones. Al volver desde otra sección se abre Servicio y se restablece el scroll. La primera orden en 375/390 queda en y=387 (antes y=457), con búsqueda, filtros, nueva orden y resumen accesibles.
- Productos mantiene tarjetas bajo 768 y tabla desde 768. La tabla cabe en tablet: mayorista/USD aparecen desde 1280 y siguen disponibles en la ficha en tablet. Las columnas que identifican, precio y stock siguen visibles. Los controles de tablet y las áreas de selección tienen 44px. Espacio abre la ficha solo con foco en la fila; con foco en la casilla cambia la selección.
- Comparador ofrece áreas de 44px para condición y color, con nombres accesibles y estado seleccionado.

## Criterios comprobados

| Criterio | Resultado |
| --- | --- |
| Taller: barra única, etapas, resumen en tira, selección solo al activarla | PASS; preserva operaciones existentes |
| Taller: regreso a primera vista y scroll inicial (#448) | PASS, navegación real entre secciones en demo |
| Productos: sin conmutador Productos/Unidades repetido | PASS, ya estaba implementado; regresión conservada |
| Productos: tarjetas móvil y tabla sin scroll interno en tablet/escritorio | PASS a 375/390/768/1280/1440, claro y oscuro |
| Comparador: condición/colores de 44px | PASS móvil/tablet, claro y oscuro |
| Cuotas: tarjetas, importes y Abrir pedido dentro de lista/ventana | PASS a 360/375/390/768/1280/1440, claro y oscuro; sin cambio de fuente |
| Stock móvil: tarjeta compacta, costo completo en fila del estado | PASS existente: 166.25px a 375 y 142.25px a 390; sin cambio de fuente |
| Ficha: Ubicación una sola vez, etiqueta Depósito y editor legible | PASS existente a 375/390/768/1280/1440; sin cambio de fuente |
| Configuración móvil: siete secciones visibles en lista con 44px | PASS existente a 375/390/768, claro y oscuro |
| Banner demo: contenido dentro de su chip, sin desborde | PASS existente a 375/390/768, claro y oscuro; enlaces usan el área táctil ::after de 44px del kit |

## Verificación

- Matriz de Taller/Productos/Comparador: treinta combinaciones de pantalla/ancho/tema, sin scroll horizontal global ni de sus tablas; controles móvil/tablet 44px.
- Regresiones de selección/abrir/Escape, vuelta a Taller, Cuotas, Stock y ficha: frontend demo o sesión simulada, sin backend/base. Configuración y banner usan ambos temas.
- Unitarios relacionados 16/16. Suite completa frontend 1485/1485, una corrida con concurrencia 1. Lint 0errores (una advertencia anterior en DeliveryOperations.jsx). Build frontend exit0.
- Stock escritorio1280/1440/1920: contención real y tooltip completo para elipsis de proveedor/SKU según TABLAS. No se permite esa excepción para importes ni IMEI; fuente de Stock conservada.
- Inspección visual CUA: Taller375 claro y Productos768 oscuro. Tres capturas totales incluyeron un intento inicial de emulación; no se usaron capturas de Playwright.

## Mapa restante

#396 continúa parcial como issue global: abastecimiento pertenece a la unidad paralela; el P3 de tipografía de KPI/gráficos/portal/landing y contrastes PIN/POS/+Dirección exige su propia comprobación por módulo. #370 es una auditoría de toda la app por rol; esta unidad cubre únicamente las pantallas asignadas. #448: se comprobó el regreso a Servicio; carrito/cobro, historial de clientes y demás criterios ajenos no se atribuyen a esta entrega. No se alteró la configuración de colores o depósitos existente.

## Novedades para el dueño

- Taller deja ver las órdenes antes y reúne sus vistas alternativas en Más acciones.
- Productos entra en tablet sin desplazamiento lateral; los precios adicionales siguen en la ficha.
- Comparador tiene botones más fáciles de tocar para cambiar condición y color.
