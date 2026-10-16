import { test, expect } from '@playwright/test'

test('snapshot #502 aísla permisos/contexto, denegaciones y carreras sin perder cola', async ({ page }) => {
  await page.route('**/src/main.jsx', route => route.fulfill({ contentType: 'application/javascript', body: '' }))
  await page.goto('/login')
  const result = await page.evaluate(async () => {
    const storage = await import('/src/lib/storage.js')
    const snapshots = await import('/src/lib/offline/snapshot.js')
    const idb = await import('/src/lib/offline/idb.js')
    const api = await import('/src/lib/api/client.js')
    const context = { empresaId:'A',sucursalId:'S1',userId:'OWNER',rol:'dueno',permisos:['*'],fuente:'api' }
    const queue=idb.crearStoreDeCola(), store=idb.crearStoreDeSnapshots()
    await queue.guardar({id:'pending-sale',idempotencyKey:'queue-unchanged',payload:{total:1234}})
    let mode='online',holdProduct=null,holdOrder=null,holdLogout=null,startedProduct,startedOrder
    let productCalls=0
    window.fetch=async(url)=>{
      const path=new URL(url,location.origin).pathname
      if(mode==='holdlogout'&&path==='/api/auth/logout')return new Promise(r=>{holdLogout=r})
      if(mode==='offline')throw new TypeError('Failed to fetch')
      if(mode==='late-owner'&&path==='/api/products'){startedProduct?.();return new Promise(r=>{holdProduct=r})}
      if(mode==='late-order-denial'&&path==='/api/orders'){startedOrder?.();return new Promise(r=>{holdOrder=r})}
      if(mode.startsWith('deny'))return Response.json({message:'denied',details:{code:'ACCESS_DENIED'}},{status:Number(mode.slice(4))})
      if(mode==='explicit')return Response.json({code:'SESSION_EXPIRED'})
      if(mode==='malformed401')return new Response('{broken',{status:401,headers:{'content-type':'application/json'}})
      if(path==='/api/products'){productCalls++;return Response.json([{id:'p',name:storage.contextoActual().userId,pricePyg:1000,...(storage.contextoActual().rol==='dueno'?{costPyg:987654}:{})}])}
      if(path==='/api/orders')return Response.json([])
      if(path==='/api/users')return Response.json([{id:'owner',name:'Owner'}])
      return Response.json({})
    }
    const check=(v,label)=>{if(!v)throw Error(label)}
    await store.guardar('catalogo:A',{version:1,products:[{id:'legacy',costPyg:555}]})
    mode='offline';await storage.setContexto(context).catch(()=>{})
    check(storage.getProductos().length===0,'legacy not applied')
    mode='online';await storage.setContexto(context);check(storage.getProductos()[0].precioCosto===987654,'owner online')
    mode='offline';await storage.refrescar();check(storage.getProductos()[0].precioCosto===987654,'same context fallback')
    for(const change of [{userId:'SELLER',rol:'VENDEDOR',permisos:['sales:create']},{sucursalId:'S2'},{empresaId:'B'},{permisos:['sales:create']}]){
      mode='online';await storage.setContexto(context)
      mode='offline';await storage.setContexto({...context,...change}).catch(()=>{})
      check(storage.getProductos().length===0,'different context must be empty')
    }
    for(const status of [401,402,403]){
      mode='online';await storage.setContexto(context)
      mode=`deny${status}`;await storage.refrescar().catch(()=>{})
      check(storage.getProductos().length===0,`denied${status} clears memory`)
      mode='offline';await storage.refrescar().catch(()=>{});check(storage.getProductos().length===0,`denied${status} no fallback`)
    }
    mode='online';await storage.setContexto(context)
    mode='explicit';await storage.refrescar().catch(()=>{});check(storage.getProductos().length===0,'explicit denial')
    mode='online';await storage.setContexto(context)
    mode='malformed401';await storage.refrescar().catch(()=>{});check(storage.getProductos().length===0,'malformed401 still clears')
    mode='offline';await storage.refrescar().catch(()=>{});check(storage.getProductos().length===0,'malformed401 no fallback')
    mode='online';await storage.setContexto(context)
    mode='deny403';await api.apiFetch('download').catch(()=>{});check(storage.getProductos().length===0,'download denial clears')
    mode='online';await storage.setContexto(context)
    window.dispatchEvent(new StorageEvent('storage',{key:'fono:cache:v3:A',newValue:JSON.stringify({productos:[{id:'legacy-injected',precioCosto:555}]})}))
    check(storage.getProductos()[0].id==='p','legacy storage event cannot inject API cache')
    // A pending request cannot join B through same URL or persist its late payload.
    api.invalidarConsultas();mode='late-owner';const ready=new Promise(r=>{startedProduct=r});const pending=storage.refrescar().catch(()=>{});await ready
    mode='online';await storage.setContexto({...context,userId:'SELLER',rol:'VENDEDOR',permisos:['sales:create']})
    holdProduct(Response.json([{id:'late-owner',name:'SECRET',costPyg:987654}]));await pending
    check(storage.getProductos()[0].nombre==='SELLER','late OWNER never applies/cache')
    mode='offline';await storage.refrescar();check(storage.getProductos()[0].nombre==='SELLER','late OWNER never overwrites snapshot')
    // A late denial from A must not purge the new B context.
    mode='online';await storage.setContexto(context);api.invalidarConsultas()
    mode='late-order-denial';const orderReady=new Promise(r=>{startedOrder=r});const lateDenied=storage.refrescar().catch(()=>{});await orderReady
    mode='online';await storage.setContexto({...context,empresaId:'B',userId:'B'})
    holdOrder(Response.json({message:'expired'},{status:401}));await lateDenied
    check(storage.getProductos()[0].nombre==='B','late401A cannot clearB')
    const session=await import('/src/lib/api/session.js')
    mode='holdlogout';const logout=session.sessionApi.logout()
    check(storage.getProductos().length===0,'logout clears memory without waiting for network')
    holdLogout(Response.json({ok:true}));await logout;mode='online'
    await storage.setContexto({fuente:'legacy'})
    check(storage.getProductos().length===0,'logout clears memory')
    await snapshots.invalidarSnapshotsPrivados()
    check((await queue.listar()).length===1,'unsynced queue survives')
    check((await queue.listar())[0].idempotencyKey==='queue-unchanged','queue unchanged')
    await storage.setContexto(context)
    check(storage.getProductos().length===1,'online context restored for cross-tab logout')
    return {productCalls,queue:await queue.listar()}
  })
  expect(result.productCalls).toBeGreaterThan(0)
  expect(result.queue).toHaveLength(1)
  const other=await page.context().newPage()
  await other.route('**/src/main.jsx',route=>route.fulfill({contentType:'application/javascript',body:''}))
  await other.goto('/login')
  await other.evaluate(async()=>{(await import('/src/lib/api/session.js')).clearSession()})
  await expect.poll(()=>page.evaluate(async()=>(await import('/src/lib/storage.js')).getProductos().length)).toBe(0)
  expect(await page.evaluate(async()=>{
    const storage=await import('/src/lib/storage.js')
    let calls=0
    window.fetch=async()=>{calls++;return Response.json([{id:'other-session',name:'B',costPyg:888}])}
    await storage.refrescar();await storage.refrescarCatalogo({forzar:true});await storage.hidratarFinanzas()
    return {calls,products:storage.getProductos()}
  })).toEqual({calls:0,products:[]})
  expect(await page.evaluate(async()=>((await import('/src/lib/offline/idb.js')).crearStoreDeCola().listar()))).toHaveLength(1)
  await other.close()
})

test('sesión #502 valida sucursal y no reactiva un principal cambiado en otra pestaña',async({page})=>{
 await page.route('**/src/main.jsx',route=>route.fulfill({contentType:'application/javascript',body:''}))
 await page.goto('/login')
 const result=await page.evaluate(async()=>{
  const {default:React}=await import('/node_modules/.vite/deps/react.js'),{default:ReactDOM}=await import('/node_modules/.vite/deps/react-dom_client.js')
  const {createRoot}=ReactDOM
  const {SesionProvider,useSesion}=await import('/src/lib/sesion.jsx')
  const storage=await import('/src/lib/storage.js'),session=await import('/src/lib/api/session.js')
  let active,current
  const owner={id:'owner',name:'OWNER',tenantId:'A',role:'ADMIN',branchId:'S1',permissions:['*']}
  active=owner
  window.fetch=async(url)=>{
   const path=new URL(url,location.origin).pathname
   if(path==='/api/auth/me')return Response.json({user:active,tenant:{id:'A',name:'Fixture'}})
   if(path==='/api/inventory-branches')return Response.json([{id:'S1',nombre:'Uno'},{id:'S2',nombre:'Dos'}])
   if(path==='/api/products')return Response.json([{id:'p',name:active.id,pricePyg:1000,costPyg:20}])
   if(path==='/api/orders'||path==='/api/users')return Response.json([])
   return Response.json({})
  }
  function Probe(){current=useSesion();return null}
  const host=document.createElement('div');document.body.append(host)
  const root=createRoot(host);root.render(React.createElement(SesionProvider,null,React.createElement(Probe)))
  for(let i=0;i<200&&current?.estado!=='dentro';i++)await new Promise(r=>setTimeout(r,10))
  if(current?.estado!=='dentro')throw Error('fixture session not ready')
  await current.cambiarSucursal('S2')
  if(storage.contextoActual().sucursalId!=='S2')throw Error('branch not updated')
  session.clearSession()
  let rejected=0
  for(const change of [{id:'other'},{tenantId:'B'},{role:'VENDEDOR'},{permissions:['sales:create']}]){
   active={...owner,...change}
   try{await current.cambiarSucursal('S1')}catch{rejected++}
   if(storage.getProductos().length)throw Error('invalid context became visible')
  }
  const result={rejected,products:storage.getProductos(),principal:storage.contextoActual().userId}
  root.unmount();host.remove();return result
 })
 expect(result).toEqual({rejected:4,products:[],principal:'owner'})
})
