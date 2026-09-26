// Definición del checklist ejecutable de rotación de tokens (#232).
//
// Pura y testeable (ver `src/lib/rotacionTokens.test.js`): el runner
// `scripts/checklist-rotacion-tokens.mjs` la recorre y este módulo no toca la
// red ni el disco. Cada paso declara:
// - `accion`: qué hacer, con el panel exacto.
// - `verificacion`: cómo saber que quedó bien antes de revocar el valor viejo.
// - `comando`: (opcional) qué correr para verificar; `env: true` significa que
//   necesita variables exportadas por quien ejecuta y el runner no las imprime.
// - `manual: true`: no hay forma de verificarlo desde el script (panel).
//
// Regla de oro: acá NO se incrustan valores, solo nombres de variables y
// comandos con placeholders (`<nuevo>`, `<viejo>`). El test lo verifica.

export const FASES = [
  { id: 'cuenta', titulo: 'Fase 0 · Cuenta y permisos (antes de rotar)', cuando: 'Día 0' },
  { id: 'expuestos', titulo: 'Fase 1 · Secretos que pudieron quedar en logs (ventana coordinada con el deploy)', cuando: 'Ventana coordinada' },
  { id: 'higiene', titulo: 'Fase 2 · Higiene', cuando: 'Semana 1' },
  { id: 'cierre', titulo: 'Fase 3 · Cierre y registro', cuando: 'Al terminar' },
]

export const PASOS = [
  // ── Fase 0: cuenta y permisos ────────────────────────────────────────────
  {
    id: '0.1',
    fase: 'cuenta',
    titulo: '2FA en la cuenta Owner (Freddy)',
    accion: 'Coolify (hub.owncoding.dev) → avatar arriba a la derecha → Security → Two-Factor Authentication → Enable → escaneá el QR (Google Authenticator/Authy/1Password) → ingresá el código de 6 dígitos.',
    verificacion: 'Cerrá sesión y volvé a entrar: tiene que pedir el segundo factor.',
    hecho: true,
    manual: true,
  },
  {
    id: '0.2',
    fase: 'cuenta',
    titulo: '2FA en la cuenta Admin (Dario)',
    accion: 'Repetí 0.1 con la cuenta de Dario.',
    verificacion: 'Cerrá sesión y volvé a entrar con esa cuenta.',
    hecho: true,
    manual: true,
  },
  {
    id: '0.3',
    fase: 'cuenta',
    titulo: 'Códigos de recuperación guardados',
    accion: 'Guardá los códigos de recuperación de las DOS cuentas en el gestor de secretos del equipo (nunca en el repo, un chat ni una captura).',
    verificacion: 'Buscá los códigos en el gestor: están y no viven en el repo.',
    manual: true,
  },
  {
    id: '0.4',
    fase: 'cuenta',
    titulo: 'Tokens de Coolify con permisos mínimos (least privilege)',
    accion: 'Coolify → Keys & Tokens: editá cada token en uso y dejá solo los permisos de Deploy; si no se puede recortar, creá uno nuevo mínimo y revocá el amplio; revocá los que no tengan dueño. No crear root ni read:sensitive.',
    verificacion: 'Con el token recortado (o el nuevo) el deploy del Hub sigue funcionando.',
    manual: true,
  },

  // ── Fase 1: expuestos ────────────────────────────────────────────────────
  {
    id: '1.1',
    fase: 'expuestos',
    titulo: 'Rotar IMEICHECK_TOKEN',
    accion: 'Panel de IMEIcheck → API → generar el token nuevo (todavía sin revocar el viejo) → Coolify → aplicación backend (api.moboss.online) → Environment Variables → IMEICHECK_TOKEN=<nuevo> (locked) → Save → Redeploy.',
    verificacion: 'Consultá un IMEI desde Inventario y mirá que responda (con IMEICHECK_LIVE como esté configurado). Recién ahí revocá el token viejo en IMEIcheck.',
    manual: true,
  },
  {
    id: '1.2',
    fase: 'expuestos',
    titulo: 'Rotar las claves sandbox de AEX',
    accion: 'Portal sandbox de AEX → regenerar MOBOS_AEX_PUBLIC_KEY, MOBOS_AEX_PRIVATE_KEY y MOBOS_AEX_WEBHOOK_TOKEN → Coolify → backend → Environment Variables (las tres, locked) → Save → Redeploy.',
    verificacion: 'Corré la prueba de sandbox y un webhook de prueba; después revocá las claves viejas en AEX.',
    comando: { bin: 'node', args: ['scripts/aex-sandbox-prueba.mjs'], texto: 'node scripts/aex-sandbox-prueba.mjs' },
  },
  {
    id: '1.3',
    fase: 'expuestos',
    titulo: 'Rotar el webhook y el token de deploy (OwnCoding Hub)',
    accion: 'Panel del Hub → generar webhook y token nuevos → actualizá el Keychain de la Mac:\n  security add-generic-password -U -s mobos-release-deploy-webhook -a "$USER" -w "<url-nueva>"\n  security add-generic-password -U -s mobos-release-deploy-token -a "$USER" -w "<token-nuevo>"\n(Los valores van solo al Keychain; nunca al repo.)',
    verificacion: 'Validá la configuración de deploy (no despliega) y, cuando quieras, un release:publish de prueba; después revocá lo viejo en el Hub.',
    comando: { bin: 'npm', args: ['run', 'release:prepare', '--', '--check-deploy-config'], texto: 'npm run release:prepare -- --check-deploy-config' },
  },
  {
    id: '1.4',
    fase: 'expuestos',
    titulo: 'Revocar/rotar el token de API de Coolify expuesto',
    accion: 'Coolify → Keys & Tokens → revocá el token que pudo quedar en los logs de deploy; si una automatización lo usa, creá uno nuevo con permisos mínimos (Deploy) como en 0.4.',
    verificacion: 'La automatización sigue funcionando con el token nuevo y el viejo ya no autentica.',
    manual: true,
  },
  {
    id: '1.5',
    fase: 'expuestos',
    titulo: 'GitHub PAT (si se usó en los logs)',
    accion: 'GitHub → Settings → Developer settings → Personal access tokens → revocá el expuesto y generá otro con el mínimo alcance; reautenticá la CLI.',
    verificacion: 'La CLI queda autenticada y el token viejo ya no sirve.',
    comando: { bin: 'gh', args: ['auth', 'status'], texto: 'gh auth status' },
  },

  // ── Fase 2: higiene ──────────────────────────────────────────────────────
  {
    id: '2.1',
    fase: 'higiene',
    titulo: 'Rotar MOBOS_AUTH_SECRET',
    accion: 'Generá el valor con `openssl rand -hex 32` → Coolify → backend → Environment Variables → MOBOS_AUTH_SECRET=<nuevo> (locked) → Save → Redeploy. Avisá que todos vuelven a iniciar sesión.',
    verificacion: 'Entrá a la app: pide login de nuevo y funciona.',
    manual: true,
  },
  {
    id: '2.2',
    fase: 'higiene',
    titulo: 'Rotar MOBOS_MAINTENANCE_TOKEN',
    accion: 'Generá el valor con `openssl rand -hex 32` → Coolify → backend → Environment Variables → MOBOS_MAINTENANCE_TOKEN=<nuevo> (locked) → Save → Redeploy.',
    verificacion: 'Los 3 endpoints internos responden 200 con el token nuevo y el viejo da 401.',
    comando: {
      bin: 'node',
      args: ['scripts/verificar-rotacion-tokens.mjs'],
      texto: 'MOBOS_MAINTENANCE_TOKEN=<nuevo> MOBOS_MAINTENANCE_TOKEN_VIEJO=<viejo> node scripts/verificar-rotacion-tokens.mjs',
      env: ['MOBOS_MAINTENANCE_TOKEN', 'MOBOS_MAINTENANCE_TOKEN_VIEJO'],
    },
  },
  {
    id: '2.3',
    fase: 'higiene',
    titulo: 'Rotar WEEM_EMAIL_RELAY_TOKEN',
    accion: 'Relay de correo → generar el token nuevo → Coolify → backend → Environment Variables (locked) → Save → Redeploy.',
    verificacion: 'Probá un correo real: recuperación de contraseña o aviso de pedido.',
    manual: true,
  },
  {
    id: '2.4',
    fase: 'higiene',
    titulo: 'Rotar RUC_SUN_API_KEY',
    accion: 'Proveedor RUC/SUN → generar la clave nueva → Coolify → backend → Environment Variables (locked) → Save → Redeploy.',
    verificacion: 'Una consulta de RUC desde Configuración responde con datos.',
    manual: true,
  },
  {
    id: '2.5',
    fase: 'higiene',
    titulo: 'Rotar GOOGLE_CLIENT_SECRET',
    accion: 'Google Cloud Console → APIs & Services → Credentials → regenerar el secreto del OAuth client → Coolify → backend → Environment Variables (locked) → Save → Redeploy.',
    verificacion: 'Login con Google en la app (y mirá que el redirect siga igual).',
    manual: true,
  },
  {
    id: '2.6',
    fase: 'higiene',
    titulo: 'Rotar MOBOS_SIFEN_CERT_PASSWORD',
    accion: 'Proveedor del certificado → generar la contraseña nueva → Coolify → backend → Environment Variables (locked) → Save → Redeploy.',
    verificacion: 'Mirá el estado SIFEN y hacé una emisión de prueba.',
    manual: true,
  },
  {
    id: '2.7',
    fase: 'higiene',
    titulo: 'Rotar MOBOS_EMAIL_OUTBOX_ENCRYPTION_KEYS_JSON',
    accion: 'Generá una clave nueva con `openssl rand -hex 32` y agregala al JSON de claves (la vieja queda para descifrar lo pendiente) → Coolify → backend → Environment Variables (locked) → Save → Redeploy.',
    verificacion: 'El outbox drena y sale un correo transaccional.',
    manual: true,
  },

  // ── Fase 3: cierre ───────────────────────────────────────────────────────
  {
    id: '3.1',
    fase: 'cierre',
    titulo: 'Auditoría de higiene del repo',
    accion: 'Corré la auditoría que busca volcados de env/secrets en el repo.',
    verificacion: 'Tiene que decir «Higiene de logs OK».',
    comando: { bin: 'npm', args: ['run', 'audit:logs'], texto: 'npm run audit:logs' },
  },
  {
    id: '3.2',
    fase: 'cierre',
    titulo: 'Redeploy y lectura de logs',
    accion: 'Hacé un redeploy del backend y de la app, y leé los logs de deploy completos.',
    verificacion: 'No aparece ningún valor de secreto (si aparece, rotá de nuevo ese secreto y avisá).',
    manual: true,
  },
  {
    id: '3.3',
    fase: 'cierre',
    titulo: 'Smoke de producción',
    accion: 'Corré el verificador de producción publicado.',
    verificacion: 'Producción responde y está en la versión publicada.',
    comando: { bin: 'npm', args: ['run', 'release:smoke'], texto: 'npm run release:smoke' },
  },
  {
    id: '3.4',
    fase: 'cierre',
    titulo: 'Registrar la rotación',
    accion: 'Completá la tabla «Registro de rotación» de docs/ROTACION-TOKENS.md con fecha, secreto, dónde se generó, dónde se cargó, cómo se verificó, viejo revocado y quién.',
    verificacion: 'La tabla no tiene filas vacías de los secretos rotados y el registro del día quedó guardado.',
    manual: true,
  },
]

/** Nombres de secretos del registro, para contrastar con docs/ROTACION-TOKENS.md. */
export const SECRETOS_DEL_REGISTRO = [
  'IMEICHECK_TOKEN',
  'AEX',
  'deploy',
  'Coolify',
  'MOBOS_AUTH_SECRET',
  'MOBOS_MAINTENANCE_TOKEN',
  'WEEM_EMAIL_RELAY_TOKEN',
  'RUC_SUN_API_KEY',
  'GOOGLE_CLIENT_SECRET',
  'MOBOS_SIFEN_CERT_PASSWORD',
  'outbox',
]
