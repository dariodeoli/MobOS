# Catálogo visual interno de MobOS (#538)

La ruta local `/biblioteca-ui` muestra componentes de `owncoding-ui` a través de `src/components/ui` y algunos objetos compartidos de MobOS. Está disponible solo con Vite en desarrollo; no se agrega al menú ni a las rutas operativas.

## Qué contiene

- Acciones: variantes de `Button`, acciones de icono y `Subtabs`.
- Campos: `FormField`, `Input`, `Select`, `PasswordInput`, `Textarea`, `MoneyInput` y `FieldRow`.
- Identidad y datos: `Avatar`, `StatusChip`, `Card`, `Stat` y `DataTable`.
- Estados: `Skeleton`, `EmptyState`, `ErrorState`, `Aviso` y `Nota`.
- Contenedor: `Modal`.
- Control local de tema claro/oscuro y layout que cambia de una columna a dos según ancho.

Los ejemplos son ficticios. Cambiar pestañas, tema, importe o abrir/cerrar el diálogo solo modifica estado local de la página; no consulta APIs, valida documentos ni guarda pedidos. Para revisar en móvil, abrir `/biblioteca-ui` con el servidor de desarrollo y reducir el viewport.

## Límites de esta fase

Esta pantalla es un índice visual, no una auditoría completa de consumidores ni una migración de componentes. La decisión de qué implementación es canónica, el inventario de duplicados, las reglas de formularios y los cambios de contratos permanecen en el trabajo arquitectónico de #538. No publicar OwnCoding UI desde esta preview.

## Verificación

`node --test src/lib/uiCatalog.test.js` comprueba que la ruta quede tras el guard de desarrollo, que la muestra componga los objetos compartidos requeridos, que no añada acceso a APIs/almacenamiento y que conserve tema y clases adaptables.
