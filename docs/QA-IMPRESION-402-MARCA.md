# #402: marca de la empresa en impresos

Candidata v1.0.229, pendiente de publicación. La normalización de identidad preserva el color configurado (brandColor/primaryColor/colorMarca). Documentos comparten acentoDeEmpresa: HEX de seis dígitos y contraste de respaldo; hojas de estación también aceptan identidad explícita.

Validación dirigida: 33 pruebas unitarias de hoja/encabezados/bloques/operaciones/prueba/venta. Chromium importa builders reales y genera 149 resultados: once documentos × tres formatos (A4/58/80) × cuatro colores, tres clases de etiquetas y hoja de estación por color, y borrado de la identidad de sesión. Un caso PASS, sin imprimir ni escribir negocio. El primer arranque del test falló por interceptar módulos api/ y el segundo por preámbulo Vite ausente; se corrigió el harness, sin cambiar la fuente para pasar. No se alteraron medidas de etiquetas, QR, firma ni transporte ESC/POS monocromo.

Límites: no confirma salida física térmica/CUPS (#17/#366), ni acredita todos los criterios del amplio #402. El tema/diseño antiguo en un iPhone instalado requiere actualizar el build (#495/#478).

Novedades para el dueño
- Hojas, recibos y etiquetas respetan el color de la empresa.
- Si el color no se puede leer sobre papel o no es válido, se usa un respaldo legible.
- Las hojas del taller también conservan la identidad de la empresa.
