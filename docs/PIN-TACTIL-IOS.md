# PIN táctil de iPhone (#484)

PinSegmentado activa el teclado de MobOS dentro del contenedor iOS. El campo permanece de solo lectura, con inputmode=none y sin autofocus: tocar las casillas no solicita el teclado de iOS. Diez teclas numéricas y Borrar actualizan el mismo estado controlado; el cuarto dígito conserva la validación del acceso y desbloqueo. Web conserva su entrada habitual y el teclado físico sigue disponible.

El teclado no guarda el PIN, no reemplaza la validación del servidor y respeta estados ocupado, error y éxito. Login y demo deshabilitan la entrada durante la verificación. El bloqueo muestra los errores también en iOS. Los objetivos táctiles son de al menos 48 px y respetan el movimiento reducido.

Validación: interacción real en navegador a 360×740, 375×667 y 390×844: puntos, borrado, PIN inválido recuperable, desbloqueo y nuevo bloqueo, teclado físico, input de solo lectura y todos los botones visibles sin desborde horizontal. Esta prueba no equivale a haber probado el retorno desde segundo plano en un iPhone físico; verificarlo en el próximo build de TestFlight.

Novedades para el dueño
- Ingresá y desbloqueá MobOS con el teclado numérico propio de la app.
- El PIN sigue oculto y los errores permiten volver a intentarlo sin depender del teclado del iPhone.

El build 1 enviado a Apple no contiene este cambio. Hace falta una compilación posterior para distribuirlo en TestFlight.
