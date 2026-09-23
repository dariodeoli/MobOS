# Conciliación IMEI desde el registro (#233) · verificación en producción

- Producción: https://app.moboss.online · versión v1.0.145 · 3/4 pasos OK
- Ronda con la acción de conciliar (v1.0.145): **desplegada**


## Marcas en los assets desplegados

- ✅ `Conciliar consulta IMEI` — el modal de conciliación
- ✅ `Guardar conciliación` — la acción de guardado
- ✅ `iCloud/US Block clean ≠ blacklist mundial` — la aclaración obligatoria

## Pasos

- ✅ **demo: entrar y leer la versión desplegada** — v1.0.145 · capturas: 01-demo-panel.jpg
- ✅ **producción: marcas de la conciliación en los assets** — 9 assets · 3 marcas presentes
- ✅ **demo: consulta simulada en la unidad** — serial AUR0001000000000 · consulta simulada registrada · capturas: 02-consulta-simulada.jpg
- ❌ **demo: conciliar desde el registro (modal + guardado)** — locator.waitFor: Timeout 15000ms exceeded.
Call log:
[2m  - waiting for getByRole('dialog', { name: 'Consultas IMEI · Conciliar' }).getByTestId('imei-consultas-lista').locator('article').first() to be visible[22m
 · capturas: 03-fallo-demo-conciliar-desde-el-registro-modal-guardado-.jpg

## Notas

- La auditoría (`auditLog IMEI_QUERY_CONCILIATED`) se verifica en el e2e con backend real (`e2e/imei-mock.spec.js`): en la demo la consulta vive en el navegador y no hay sesión real para consultar `/api/audit`.
- El modal precarga la nota con la aclaración «iCloud/US Block clean ≠ blacklist mundial» y la muestra como ayuda.
- Errores de consola durante la corrida: 0.

