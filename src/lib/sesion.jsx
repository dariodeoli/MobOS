import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { isDemoRuntime, demoSessionActive, demoSessionRole, saveDemoSession, clearDemoSession } from './demoMode'
import { clearSession, getCompanyContext, sessionApi, resources } from '@/lib/api'
import { setActor, setContexto, prepararDatosDemo } from '@/lib/storage'
import { usarTenantImpresoras, usarSucursalImpresoras } from '@/lib/printing/agent'

const SesionContext = createContext(null)

function sucursalKey(empresaId) { return `mobos:sucursal-activa:${empresaId}` }
function leerSucursalActiva(empresaId) { try { return localStorage.getItem(sucursalKey(empresaId)) } catch { return null } }
function guardarSucursalActiva(empresaId, sucursalId) { try { localStorage.setItem(sucursalKey(empresaId), sucursalId) } catch { /* sin persistencia, la sesión sigue válida */ } }

function adaptarUsuario(user) {
  return { ...user, id: user?.id, email: user?.email || null, user_metadata: { nombre: user?.name || user?.user_metadata?.nombre || user?.email || '' } }
}
function adaptarEmpresa(user, tenant) {
  if (user.tenantId === 'mobos-demo') return { id: 'mobos-demo', nombre: 'MobOS Tienda Demo', slug: 'demo', email: null, rol: user.role === 'ADMIN' ? 'dueno' : 'VENDEDOR' }
  const context = getCompanyContext()
  return { id: user.tenantId || context?.tenant?.id, nombre: context?.tenant?.name || user.tenantName || 'Mi tienda', slug: context?.tenant?.slug || user.tenantSlug || 'mi-tienda', email: tenant?.email || context?.tenant?.email || user.tenantEmail || null, rol: user.role === 'ADMIN' ? 'dueno' : user.role, expenseLimitPyg: tenant?.expenseLimitPyg ?? context?.tenant?.expenseLimitPyg ?? null, purchaseCreditLimitPyg: tenant?.purchaseCreditLimitPyg ?? context?.tenant?.purchaseCreditLimitPyg ?? null, belowListPct: tenant?.belowListPct ?? context?.tenant?.belowListPct ?? null }
}

// El perfil del dueño que responde /api/auth/me (persistido en la identidad
// Google) gana sobre la copia efímera del localStorage del login.
function combinarPerfil(ownerProfile) {
  if (ownerProfile?.name || ownerProfile?.picture) return ownerProfile
  return getCompanyContext()?.profile || null
}

export function SesionProvider({ children }) {
  const [estado, setEstado] = useState('cargando')
  const [usuario, setUsuario] = useState(null); const [empresas, setEmpresas] = useState([]); const [empresa, setEmpresa] = useState(null); const [sucursales, setSucursales] = useState([]); const [sucursal, setSucursal] = useState(null); const [vendedores, setVendedores] = useState([])
  const [perfilEmpresa, setPerfilEmpresa] = useState(() => getCompanyContext()?.profile || null)
  const activarSesion = useCallback(async (rawUser, { tenant, prepararLegacy = false, perfil } = {}) => {
    const user = adaptarUsuario(rawUser); const emp = adaptarEmpresa(rawUser, tenant); const suc = rawUser.branchId ? { id: rawUser.branchId, nombre: rawUser.branchName || 'Sucursal' } : null
    // Los datos reales se hidratan desde la API; el almacenamiento local queda
    // reservado al demo y a los módulos que aún están en transición.
    await setContexto({ empresaId: emp.id, sucursalId: suc?.id || null, userId: user.id, rol: emp.rol, fuente: prepararLegacy ? 'legacy' : 'api' })
    let listaSucursales = suc ? [suc] : []
    let sucursalActiva = suc
    // Los dueños y gerentes pueden no tener sucursal asignada (cuentas viejas).
    // Se hidrata la lista desde la API y se conserva la elección previa.
    if ((rawUser.role === 'ADMIN' || rawUser.role === 'GERENTE') && emp.id !== 'mobos-demo') {
      try {
        const branches = await resources.inventoryBranches.list()
        if (Array.isArray(branches) && branches.length) {
          listaSucursales = branches
          const guardada = leerSucursalActiva(emp.id)
          sucursalActiva = branches.find((b) => b.id === rawUser.branchId) || branches.find((b) => b.id === guardada) || (branches.length === 1 ? branches[0] : null)
          if (sucursalActiva) guardarSucursalActiva(emp.id, sucursalActiva.id)
        }
      } catch {
        // Sin catálogo de sucursales la sesión sigue siendo válida.
      }
    }
    setUsuario(user); setEmpresa(emp); setEmpresas([emp]); setSucursal(sucursalActiva); setSucursales(listaSucursales); setVendedores(getCompanyContext()?.sellers || []); setPerfilEmpresa(perfil !== undefined ? perfil : getCompanyContext()?.profile || null); setEstado('dentro')
  }, [])
  const entrarDemo = useCallback(async (role = demoSessionRole()) => {
    saveDemoSession(role); await activarSesion({ id: 'demo-user', email: 'demo@example.invalid', name: role === 'ADMIN' ? 'Dueño demo' : 'Vendedor demo', tenantId: 'mobos-demo', role, branchId: 'mobos-demo-central', branchName: 'Tienda demo' }, { prepararLegacy: true }); prepararDatosDemo()
  }, [activarSesion])
  useEffect(() => {
    let vivo = true
    let intentos = 0
    if (isDemoRuntime) { if (demoSessionActive()) entrarDemo(); else setEstado('fuera'); return () => { vivo = false } }
    // Un error de red no debe expulsar al usuario: se reintenta la validación
    // unas veces y solo se cierra la sesión visual ante un 401 real.
    const validar = async () => {
      try {
        const result = await sessionApi.me()
        if (!vivo) return
        if (result?.user) await activarSesion(result.user, { tenant: result.tenant, perfil: combinarPerfil(result.ownerProfile) })
        else { clearSession(); setEstado('fuera') }
      } catch (error) {
        if (!vivo) return
        if (error?.status === 401) { clearSession(); setEstado('fuera') }
        else if (intentos < 4) { intentos += 1; setTimeout(() => { if (vivo) validar() }, 3000) }
        else { console.error('[sesion] no se pudo validar la sesión real:', error); setEstado('fuera') }
      }
    }
    validar()
    return () => { vivo = false }
  }, [activarSesion, entrarDemo])
  useEffect(() => { setActor(usuario ? { vendedorId: usuario.id, nombre: usuario.user_metadata?.nombre || usuario.email, esPropietario: empresa?.rol === 'dueno' } : null) }, [usuario, empresa])
  // En render (no en effect) para que los componentes que leen configImpresora()
  // vean el tenant/sucursal correctos desde su primer render.
  usarTenantImpresoras(usuario?.tenantId)
  usarSucursalImpresoras(sucursal?.id)
  async function entrarEmpresa(credentials) { const result = await sessionApi.loginCompany(credentials); setEmpresa(result.tenant ? { id: result.tenant.id, nombre: result.tenant.name, rol: null } : null); setEmpresas(result.tenant ? [result.tenant] : []); setVendedores(result.sellers || []); return result }
  async function entrarVendedor(credentials) { const result = await sessionApi.loginSeller(credentials); const contexto = await sessionApi.me().catch(() => null); await activarSesion(result.user, { tenant: contexto?.tenant, perfil: combinarPerfil(contexto?.ownerProfile) }); return result }
  async function cambiarVendedor(credentials) { const result = await sessionApi.switchSeller(credentials); const contexto = await sessionApi.me().catch(() => null); await activarSesion(result.user, { tenant: contexto?.tenant, perfil: combinarPerfil(contexto?.ownerProfile) }); return result }
  async function entrar(session) { if (!session?.user) throw new Error('Usá el flujo de autenticación de MobOS.'); await activarSesion(session.user) }
  async function salir() { if (isDemoRuntime) { clearDemoSession(); clearSession(); await setContexto({ fuente: 'legacy' }); window.location.assign('/login'); return }; try { await sessionApi.logout() } catch (error) { console.error('[sesion] el cierre remoto falló:', error) } await setContexto({ fuente: 'legacy' }); setUsuario(null); setEmpresa(null); setEmpresas([]); setSucursal(null); setSucursales([]); setVendedores([]); setPerfilEmpresa(null); setEstado('fuera') }
  async function cambiarSucursal(sucursalId) {
    const destino = sucursales.find((s) => s.id === sucursalId)
    if (!destino) return
    setSucursal(destino)
    guardarSucursalActiva(empresa?.id, destino.id)
  }
  async function cambiarEmpresa() {
    // El backend mantiene UNA empresa por sesión: para operar otra tienda hay
    // que cerrar sesión y volver a autenticarse. No existe endpoint de cambio
    // de empresa, así que devolvemos un error claro en vez de simular soporte.
    // El SelectorSucursal solo ofrece esta opción con varias empresas (Google
    // multi-store), caso que hoy no se da: la sesión trae una sola empresa.
    throw new Error('Cambiar de empresa requiere cerrar sesión y volver a ingresar.')
  }
  function actualizarEmpresa(cambios) {
    setEmpresa(current => (current ? { ...current, ...cambios } : current))
  }
  function actualizarNombreUsuario(nombre) {
    setUsuario(current => current ? { ...current, name: nombre, user_metadata: { ...(current.user_metadata || {}), nombre } } : current)
  }
  const sesion = usuario ? { vendedorId: usuario.id, nombre: usuario.user_metadata?.nombre || usuario.email, correo: usuario.email, esPropietario: empresa?.rol === 'dueno', rol: empresa?.rol || null } : null
  return <SesionContext.Provider value={{ estado, sesion, usuario, empresa, empresas, sucursal, sucursales, vendedores, perfilEmpresa, entrar, entrarEmpresa, entrarVendedor, cambiarVendedor, entrarDemo, esDemo: isDemoRuntime, salir, cambiarSucursal, cambiarEmpresa, actualizarEmpresa, actualizarNombreUsuario, recargarEmpresas: async () => {} }}>{children}</SesionContext.Provider>
}
export function useSesion() { return useContext(SesionContext) }
