import { useCallback, useState } from 'react'

// Vista lista/cuadrícula recordada por pantalla (docs/PLANTILLA-OBJETOS.md §7).
// La clave es el nombre estable del listado y se guarda como
// `mobos:<clave>-vista`; si el navegador no permite persistir, la vista vive
// solo en memoria. Devuelve [vista, cambiarVista] para `ListGridToggle`.
export function useVistaListaGrid(clave, inicial = 'list') {
  const almacen = `mobos:${clave}-vista`
  const [vista, setVista] = useState(() => {
    try {
      return localStorage.getItem(almacen) || inicial
    } catch {
      return inicial
    }
  })
  const cambiarVista = useCallback((siguiente) => {
    setVista(siguiente)
    try {
      localStorage.setItem(almacen, siguiente)
    } catch { /* sin persistencia */ }
  }, [almacen])
  return [vista, cambiarVista]
}
