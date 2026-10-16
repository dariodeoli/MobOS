import { vistas, contacto, fichaProducto, nombre } from './publicas-extra.js'
const token='a'.repeat(32)
export const nombreLargo='IMPORTADORAINTERNACIONALDETELEFONOSPARAGUAYSERVICIOTECNICO'
export const skuLargo='SKU-XYZ'.repeat(9)
export const serialLargo='SERIALUNITARIO1234567890ABCDEFGH'
export const paginas=vistas.filter(v=>!['carrito','alternativa'].includes(v.id)).map(v=>{
  const p=structuredClone(v)
  if(v.id==='cuenta') {p.ruta=`/cuenta/${token}`;p.api=`/api/portal/${token}`;p.payload.company={name:nombreLargo,logo:true};p.payload.customer.name=nombreLargo;p.logoApi=`${p.api}/logo`}
  if(v.id==='portal') {p.ruta=`/portal/${token}`;p.api=`/api/public/portal/${token}`;p.payload.tienda={...p.payload.tienda,nombre:nombreLargo,tieneLogo:true};p.payload.cliente.nombre=nombreLargo;p.logoApi=`/api/portal/${token}/logo`}
  if(v.id==='producto') {p.ruta=`/producto/${skuLargo}`;p.payload=[{...fichaProducto,name:nombreLargo,sku:skuLargo}];p.listo=nombreLargo}
  return p
})
paginas.push({id:'cotizacion',ruta:`/cotizacion/${token}`,api:`/api/quotes/public/${token}`,logoApi:`/api/quotes/public/${token}/logo`,listo:'COT-403',payload:{number:'COT-403',status:'SENT',customerName:nombreLargo,company:{name:nombreLargo,logo:true},branch:{name:'Casa Central',phone:'0981123456'},contacto,items:[{description:nombreLargo,quantity:1,unitPricePyg:100000000,totalPyg:100000000}],subtotalPyg:100000000,totalPyg:100000000,validUntil:'2030-11-30T00:00:00Z',notes:'Condiciones públicas de la cotización.'}})
paginas.push({id:'garantia',ruta:`/garantia/${token}`,api:`/api/public/warranty/${token}`,listo:'Garantía vigente',payload:{productName:nombreLargo,serial:serialLargo,orderNumber:'PED-403',status:'ACTIVE',daysRemaining:240,warrantyDays:365,purchasedAt:'2026-10-14T12:00:00Z',expiresAt:'2027-10-14T12:00:00Z',store:{name:nombre,city:'Asunción',phone:'0981123456'},contacto,coverage:'Defectos de fabricación',exclusions:'Golpes y humedad'}})
