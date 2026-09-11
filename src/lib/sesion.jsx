import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import {
  setActor,
  setContexto,
  salirDeTodo,
  sesionSupabase,
  misEmpresas,
  sucursalesDe,
  sucursalGuardada,
  supabase,
} from '@/lib/storage'

const SesionContext = createContext(null)

// Estados posibles:
//   cargando   → todavía no sabemos si hay sesión (no mostrar nada definitivo)
//   fuera      → no hay sesión: va al login
//   sinEmpresa → hay usuario pero todavía no pertenece a ninguna empresa
//   dentro     → hay usuario, empresa y sucursal activas
export function SesionProvider({ children }) {
  const [estado, setEstado] = useState('cargando')
  const [usuario, setUsuario] = useState(null)
  const [empresas, setEmpresas] = useState([])
  const [empresa, setEmpresa] = useState(null)
  const [sucursales, setSucursales] = useState([])
  const [sucursal, setSucursal] = useState(null)

  // Deja activa una empresa y una de sus sucursales, y se lo avisa a la capa
  // de datos para que empiece a leer y escribir ahí.
  const activar = useCallback(async (emp, sucursalId, user) => {
    const sucs = await sucursalesDe(emp.id)
    const elegida =
      sucs.find((s) => s.id === sucursalId) ||
      sucs.find((s) => s.id === emp.sucursalId) ||
      sucs[0] ||
      null
    setEmpresa(emp)
    setSucursales(sucs)
    setSucursal(elegida)
    await setContexto({
      empresaId: emp.id,
      sucursalId: elegida?.id || null,
      userId: user?.id || null,
      rol: emp.rol,
    })
    setEstado('dentro')
  }, [])

  const cargar = useCallback(
    async (user) => {
      setUsuario(user)
      const lista = await misEmpresas()
      setEmpresas(lista)
      if (lista.length === 0) {
        setEstado('sinEmpresa')
        return
      }
      await activar(lista[0], sucursalGuardada(), user)
    },
    [activar],
  )

  // Al arrancar: ¿hay sesión guardada? Y quedamos escuchando los cambios de
  // auth (logout, token vencido) para no quedar desincronizados.
  useEffect(() => {
    let vivo = true
    ;(async () => {
      const s = await sesionSupabase()
      if (!vivo) return
      if (s?.user) await cargar(s.user)
      else setEstado('fuera')
    })()

    const { data: sub } =
      supabase?.auth.onAuthStateChange((evento) => {
        if (!vivo || evento !== 'SIGNED_OUT') return
        setUsuario(null)
        setEmpresas([])
        setEmpresa(null)
        setSucursales([])
        setSucursal(null)
        setEstado('fuera')
      }) || {}

    return () => {
      vivo = false
      sub?.subscription?.unsubscribe()
    }
  }, [cargar])

  // La auditoría necesita saber quién está haciendo cada cosa.
  useEffect(() => {
    setActor(
      usuario
        ? {
            vendedorId: usuario.id,
            nombre: usuario.user_metadata?.nombre || usuario.email,
            esPropietario: empresa?.rol === 'dueno',
          }
        : null,
    )
  }, [usuario, empresa])

  async function entrar(user) {
    setEstado('cargando')
    await cargar(user)
  }

  async function salir() {
    await salirDeTodo()
    setEstado('fuera')
  }

  async function cambiarSucursal(sucursalId) {
    if (!empresa || sucursalId === sucursal?.id) return
    await activar(empresa, sucursalId, usuario)
  }

  async function cambiarEmpresa(empresaId) {
    const emp = empresas.find((e) => e.id === empresaId)
    if (!emp || empresaId === empresa?.id) return
    setEstado('cargando')
    await activar(emp, null, usuario)
  }

  async function recargarEmpresas() {
    const lista = await misEmpresas()
    setEmpresas(lista)
    if (lista.length > 0) await activar(lista[0], null, usuario)
  }

  // `sesion` mantiene la forma que ya usan los componentes (nombre,
  // esPropietario), así no hay que tocarlos uno por uno.
  const sesion = usuario
    ? {
        vendedorId: usuario.id,
        nombre: usuario.user_metadata?.nombre || usuario.email,
        correo: usuario.email,
        esPropietario: empresa?.rol === 'dueno',
        rol: empresa?.rol || null,
      }
    : null

  return (
    <SesionContext.Provider
      value={{
        estado,
        sesion,
        usuario,
        empresa,
        empresas,
        sucursal,
        sucursales,
        entrar,
        salir,
        cambiarSucursal,
        cambiarEmpresa,
        recargarEmpresas,
      }}
    >
      {children}
    </SesionContext.Provider>
  )
}

export function useSesion() {
  return useContext(SesionContext)
}
