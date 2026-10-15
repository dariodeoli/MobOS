// El aviso debe salir al arrancar el servidor, incluso antes del primer login.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { warnIfSecretEncryptionMissing } = await import('./lib/apple-auth')
    warnIfSecretEncryptionMissing()
  }
}
