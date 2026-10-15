import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import { sessionApi } from '../../src/lib/api/session.js'
import { usarAlmacen, guardarTokens, hayTokens } from '../../src/lib/api/nativo.js'
Capacitor.getPlatform=()=> 'ios';Capacitor.isNativePlatform=()=>true
const datos=new Map()
usarAlmacen({get:async key=>datos.get(key),set:async(key,value)=>datos.set(key,value),remove:async key=>datos.delete(key)})
await guardarTokens({token:'EMPRESA_QA_484',sellerToken:'VENDEDOR_QA_484'})
function Prueba() {
 const [estado,setEstado]=useState('Con sesión')
 return <><button onClick={async()=>{await sessionApi.logout();setEstado(`Sin sesión: ${hayTokens()?'error':'ok'}`)}}>Cerrar sesión</button><output>{estado}</output><button onClick={()=>setEstado(`Keychain: ${datos.size}`)}>Comprobar Keychain</button></>
}
createRoot(document.getElementById('root')).render(<Prueba />)
