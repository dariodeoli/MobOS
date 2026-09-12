import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { isDemoRuntime, demoSessionActive, demoSessionRole, saveDemoSession, clearDemoSession } from './demoMode'
import { clearSession, getCompanyContext, sessionApi } from '@/lib/api'
import { setActor, setContexto, prepararDatosDemo } from '@/lib/storage'

const SesionContext = createContext(null)

function adaptarUsuario(user) {
  return { ...user, id: user?.id, email: user?.email || null, user_metadata: { nombre: user?.name || user?.user_metadata?.nombre || user?.email || '' } }
}
function adaptarEmpresa(user) {
  if (user.tenantId === 'mobos-demo') return { id: 'mobos-demo', nombre: 'MobOS Tienda Demo', slug: 'demo', rol: user.role === 'ADMIN' ? 'dueno' : 'VENDEDOR' }
  const context = getCompanyContext()
  return { id: user.tenantId || context?.tenant?.id, nombre: context?.tenant?.name || user.tenantName || 'Mi tienda', slug: context?.tenant?.slug || user.tenantSlug || 'mi-tienda', rol: user.role === 'ADMIN' ? 'dueno' : user.role }
}

export function SesionProvider({ children }) {
  const [estado, setEstado] = useState('cargando')
  const [usuario, setUsuario] = useState(null); const [empresas, setEmpresas] = useState([]); const [empresa, setEmpresa] = useState(null); const [sucursales, setSucursales] = useState([]); const [sucursal, setSucursal] = useState(null); const [vendedores, setVendedores] = useState([])
  const activarSesion = useCallback(async (rawUser, { prepararLegacy = false } = {}) => {
    const user = adaptarUsuario(rawUser); const emp = adaptarEmpresa(rawUser); const suc = rawUser.branchId ? { id: rawUser.branchId, nombre: rawUser.branchName || 'Sucursal' } : null
    // Los datos reales se hidratan desde la API; el almacenamiento local queda
    // reservado al demo y a los módulos que aún están en transición.
    await setContexto({ empresaId: emp.id, sucursalId: suc?.id || null, userId: user.id, rol: emp.rol, fuente: prepararLegacy ? 'legacy' : 'api' })
    setUsuario(user); setEmpresa(emp); setEmpresas([emp]); setSucursal(suc); setSucursales(suc ? [suc] : []); setVendedores(getCompanyContext()?.sellers || []); setEstado('dentro')
  }, [])
  const entrarDemo = useCallback(async (role = demoSessionRole()) => {
    saveDemoSession(role); await activarSesion({ id: 'demo-user', email: 'demo@example.invalid', name: role === 'ADMIN' ? 'Dueño demo' : 'Vendedor demo', tenantId: 'mobos-demo', role, branchId: 'mobos-demo-central', branchName: 'Tienda demo' }, { prepararLegacy: true }); prepararDatosDemo()
  }, [activarSesion])
  useEffect(() => {
    let vivo = true
    if (isDemoRuntime) { if (demoSessionActive()) entrarDemo(); else setEstado('fuera'); return () => { vivo = false } }
    sessionApi.me().then(async (result) => { if (vivo && result?.user) await activarSesion(result.user); else if (vivo) { clearSession(); setEstado('fuera') } }).catch((error) => { if (!vivo) return; if (error?.status === 401) { clearSession(); setEstado('fuera') } else { console.error('[sesion] no se pudo validar la sesión real:', error); setEstado('fuera') } })
    return () => { vivo = false }
  }, [activarSesion, entrarDemo])
  useEffect(() => { setActor(usuario ? { vendedorId: usuario.id, nombre: usuario.user_metadata?.nombre || usuario.email, esPropietario: empresa?.rol === 'dueno' } : null) }, [usuario, empresa])
  async function entrarEmpresa(credentials) { const result = await sessionApi.loginCompany(credentials); setEmpresa(result.tenant ? { id: result.tenant.id, nombre: result.tenant.name, rol: null } : null); setEmpresas(result.tenant ? [result.tenant] : []); setVendedores(result.sellers || []); return result }
  async function entrarVendedor(credentials) { const result = await sessionApi.loginSeller(credentials); await activarSesion(result.user); return result }
  async function cambiarVendedor(credentials) { const result = await sessionApi.switchSeller(credentials); await activarSesion(result.user); return result }
  async function entrar(session) { if (!session?.user) throw new Error('Usá el flujo de autenticación de MobOS.'); await activarSesion(session.user) }
  async function salir() { if (isDemoRuntime) { clearDemoSession(); clearSession(); await setContexto({ fuente: 'legacy' }); window.location.assign('/login'); return }; await sessionApi.logout(); await setContexto({ fuente: 'legacy' }); setUsuario(null); setEmpresa(null); setEmpresas([]); setSucursal(null); setSucursales([]); setVendedores([]); setEstado('fuera') }
  const sesion = usuario ? { vendedorId: usuario.id, nombre: usuario.user_metadata?.nombre || usuario.email, correo: usuario.email, esPropietario: empresa?.rol === 'dueno', rol: empresa?.rol || null } : null
  return <SesionContext.Provider value={{ estado, sesion, usuario, empresa, empresas, sucursal, sucursales, vendedores, entrar, entrarEmpresa, entrarVendedor, cambiarVendedor, entrarDemo, esDemo: isDemoRuntime, salir, cambiarSucursal: async () => {}, cambiarEmpresa: async () => {}, recargarEmpresas: async () => {} }}>{children}</SesionContext.Provider>
}
export function useSesion() { return useContext(SesionContext) }
