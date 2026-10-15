import { isNativeIOS } from '../plataforma.js'

const cargarPlugins = async () => {
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([
    import('@capacitor/filesystem'),
    import('@capacitor/share'),
  ])
  return { Filesystem, Directory, Share }
}

// El PNG permanece solo en caché privada hasta cerrar la hoja de iOS. No se
// sube al servidor ni se expone el directorio Documents/Archivos o iCloud.
export async function compartirArchivoNativo({ dataUrl, nombre = 'documento.png', titulo = '', texto = '' } = {}, opciones = {}) {
  if (!(opciones.ios ?? isNativeIOS())) return false
  const datos = /^data:image\/png;base64,([A-Za-z0-9+/=\r\n]+)$/.exec(String(dataUrl || ''))?.[1]
  if (!datos) return false
  let plugins
  let path
  try {
    plugins = await (opciones.cargarPlugins || cargarPlugins)()
    const id = globalThis.crypto.randomUUID()
    const seguro = String(nombre).replace(/[^a-zA-Z0-9._-]/g, '-').slice(-100) || 'documento.png'
    path = `mobos-${id}-${seguro}`
    const { uri } = await plugins.Filesystem.writeFile({
      path, data: datos, directory: plugins.Directory.Cache,
    })
    await plugins.Share.share({ files: [uri], title: titulo, text: texto })
    return 'compartido'
  } catch (error) {
    if (error?.name === 'AbortError' || /cancel/i.test(String(error?.message || ''))) return 'cancelado'
    // Nunca registrar el documento ni el error del plugin: puede incluir la URI.
    console.error('[compartir] no se pudo abrir la hoja de archivos de iOS')
    return false
  } finally {
    if (plugins && path) {
      try {
        await plugins.Filesystem.deleteFile({ path, directory: plugins.Directory.Cache })
      } catch {
        console.warn('[compartir] no se pudo limpiar el archivo temporal de caché')
      }
    }
  }
}
