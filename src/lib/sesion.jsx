import { createContext, useContext, useState, useEffect } from 'react'
import { setActor } from '@/lib/storage'

const SesionContext = createContext(null)

const KEY = 'fono:sesion'

function leer() {
  try {
    return JSON.parse(sessionStorage.getItem(KEY)) || null
  } catch {
    return null
  }
}

export function SesionProvider({ children }) {
  const [sesion, setSesion] = useState(leer)

  // Mantiene sincronizado "quién está logueado" con la auditoría del storage,
  // para que cada acción sobre una venta quede registrada con su autor.
  useEffect(() => {
    setActor(sesion)
  }, [sesion])

  function entrar(nueva) {
    sessionStorage.setItem(KEY, JSON.stringify(nueva))
    setSesion(nueva)
  }
  function salir() {
    sessionStorage.removeItem(KEY)
    setSesion(null)
  }
  function setPropietario(valor) {
    const nueva = { ...sesion, esPropietario: valor }
    sessionStorage.setItem(KEY, JSON.stringify(nueva))
    setSesion(nueva)
  }

  return (
    <SesionContext.Provider value={{ sesion, entrar, salir, setPropietario }}>
      {children}
    </SesionContext.Provider>
  )
}

export function useSesion() {
  return useContext(SesionContext)
}
