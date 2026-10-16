# #499: un diálogo modal activo

owncoding-ui PR48 integrado en a5808857f898a4e3538a0ad3b9906ca6545529fd y tag v0.68.13 publicado tras CI de PR38834345982 y main38834596775 exitosos. MobOS consume el tarball del tag con integridad fijada en lockfile.

La pila avisa a todas sus capas al abrir una hija; no cambia API pública ni CSS. Biblioteca: RED4de5 nuevos→GREEN13 relacionados, full1350PASS y tipos/build/bundle/galería/README. Integrador regeneró dist,13relacionadosPASS. MobOS: Chromium2/2PASS en390claro y1440oscuro con ficha/editor reales; único aria-modal=true, Tab/ShiftTab contenidos, Escape cierra solo hijo, foco restituido y reapertura correcta. Mocks de RUC, sin proveedor real ni escrituras de negocio. Regresión incluida en gate33RUC de CI.

Límites: Chromium y DOM prueban semántica/foco; no se afirma VoiceOver físico. MobOS1.0.229 pendiente de publicar.

Novedades para el dueño
- Los lectores de pantalla identifican una sola ventana activa.
- Al cerrar el editor, el foco vuelve a su botón en la ficha.
