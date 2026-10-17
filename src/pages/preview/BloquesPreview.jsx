// Preview de los bloques compartidos del rediseño (docs/PANTALLAS.md). **Solo
// DEV** (`/bloques-preview`): no existe en producción ni en el menú; lo usa
// e2e/frontend/blocks-preview.frontend.spec.js a 375 y 1280. Datos ficticios.
import { useState } from 'react'
import Toolbar from '@/components/shared/Toolbar'
import BarraModulo from '@/components/shared/BarraModulo'
import ListaDensa from '@/components/shared/ListaDensa'
import FieldRow from '@/components/shared/FieldRow'
import StatusChip from '@/components/shared/StatusChip'
import { usePaginaLista } from '@/components/shared/usePaginaLista'
import StatGrid from '@/components/shared/StatGrid'
import CodigoSegmentado from '@/components/shared/CodigoSegmentado'
import CheckAnimado from '@/components/shared/CheckAnimado'
import { imeiValido } from '@/lib/codigoSegmentado'
import { Button, Input, Stat } from '@/components/ui'
import { formatGs } from '@/utils/moneda'

const FILAS = Array.from({ length: 14 }, (_, i) => ({
  id: i + 1,
  titulo: i % 3 === 0 ? `ZZ Cliente con un nombre bastante largo número ${i + 1} S.A.` : `ZZ Cliente ${i + 1}`,
  meta: `Pedido #${1000 + i} · Sucursal Centro`,
  monto: 12_500_000 + i * 1_234_567,
  estado: ['COMPLETED', 'PENDING', 'CANCELLED'][i % 3],
}))

const COLUMNAS = [
  { key: 'titulo', header: 'Cliente', ancho: 'minmax(0,2fr)', cell: (f) => f.titulo },
  { key: 'meta', header: 'Detalle', ancho: 'minmax(0,1.5fr)', cell: (f) => <span className="text-mute">{f.meta}</span> },
  { key: 'monto', header: 'Monto', ancho: '10rem', align: 'right', cell: (f) => <span className="tabular-nums">{formatGs(f.monto)}</span> },
  { key: 'estado', header: 'Estado', ancho: '8.5rem', cell: (f) => <StatusChip dominio="pedido" estado={f.estado} /> },
  { key: 'acc', header: 'Acciones', sr: true, ancho: '5rem', align: 'right', cell: () => <Button type="button" variant="outline" className="min-h-9 px-3 text-xs">Ver</Button> },
]

function CodigosPreview() {
  const [puente, setPuente] = useState('')
  const [imei, setImei] = useState('')
  return (
    <section aria-label="Códigos" className="space-y-3" data-testid="prev-codigos">
      <h2 className="text-base font-semibold">CodigoSegmentado y CheckAnimado</h2>
      <div data-testid="prev-puente"><CodigoSegmentado id="prev-puente-0" ariaLabel="Código de vinculación" grupos={[5, 5]} alfabeto="letras" value={puente} onChange={setPuente} /><output data-testid="prev-puente-valor">{puente}</output></div>
      <div data-testid="prev-imei"><CodigoSegmentado ariaLabel="IMEI" grupos={[2, 6, 6, 1]} alfabeto="numerico" validar={imeiValido} mensajeError="El IMEI no es válido." value={imei} onChange={setImei} /></div>
      <CheckAnimado />
    </section>
  )
}

export default function BloquesPreview() {
  const [busqueda, setBusqueda] = useState('')
  const [fieldValue, setFieldValue] = useState('Dato conservado')
  const [fieldError, setFieldError] = useState(false)
  const lista = usePaginaLista(FILAS.filter((f) => f.titulo.toLowerCase().includes(busqueda.toLowerCase())), { tamano: 5 })
  return (
    <main data-testid="bloques-preview" className="min-h-screen space-y-6 bg-ink-900 px-4 py-5 text-fore md:px-6">
      <section aria-label="Toolbar" className="space-y-2">
        <h2 className="text-base font-semibold">Toolbar</h2>
        <Toolbar
          testId="prev-toolbar"
          label="Herramientas de ejemplo"
          search={<Input aria-label="Buscar" placeholder="Buscar cliente" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className="min-h-11" />}
          filters={<Button type="button" variant="outline" className="min-h-11">Estado</Button>}
          view={<Button type="button" variant="outline" className="min-h-11">Vista</Button>}
          more={<Button type="button" variant="outline" className="min-h-11" aria-label="Más acciones">Más</Button>}
          primary={<Button type="button" className="min-h-11">Nuevo pedido</Button>}
        />
        <BarraModulo titulo="Inventario" descripcion="Shim de BarraModulo" testId="barra-inventario">
          <Button type="button" variant="outline" className="min-h-11">Acción</Button>
        </BarraModulo>
      </section>

      <section aria-label="Indicadores" className="space-y-2">
        <h2 className="text-base font-semibold">Stat compact</h2>
        <StatGrid>
          <Stat compact label="Ventas del mes" valor={formatGs(123_456_789)} sub="vs mes anterior" />
          <Stat compact label="Por cobrar" valor={formatGs(98_765_432)} />
          <Stat compact label="Caja" valor={formatGs(45_000_000)} />
          <Stat compact label="Gastos" valor={formatGs(7_890_123)} />
        </StatGrid>
      </section>

      <section aria-label="Listado" className="space-y-2">
        <h2 className="text-base font-semibold">ResponsiveList</h2>
        <ListaDensa lista={lista} columns={COLUMNAS} obtenerClave={(f) => f.id} testId="prev-lista" etiquetaTabla="Pedidos de ejemplo" />
      </section>

      <section aria-label="Campos" className="space-y-2">
        <h2 className="text-base font-semibold">FieldRow</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <FieldRow testId="prev-telefono" label="Teléfono" htmlFor="prev-tel" prefijo="+595" hint="Sin el cero inicial">
            <Input id="prev-tel" inputMode="tel" defaultValue="981 234 567" />
          </FieldRow>
          <FieldRow testId="prev-ruc" label="RUC" htmlFor="prev-ruc-in" final={<Button type="button" variant="ghost" aria-label="Consultar RUC">Consultar</Button>}>
            <Input id="prev-ruc-in" defaultValue="80012345-6" />
          </FieldRow>
          <FieldRow
            testId="prev-error"
            label="Campo con respuesta del servidor"
            htmlFor="prev-error-input"
            error={fieldError ? 'No se pudo guardar. El valor ingresado se conserva.' : undefined}
            final={<Button type="button" variant="ghost" aria-label="Alternar error de ejemplo" onClick={() => setFieldError((actual) => !actual)}>Probar error</Button>}
          >
            <Input id="prev-error-input" value={fieldValue} onChange={(event) => setFieldValue(event.target.value)} />
          </FieldRow>
        </div>
      </section>

      <section aria-label="Estados" className="space-y-2">
        <h2 className="text-base font-semibold">StatusChip</h2>
        <div className="flex flex-wrap items-start gap-2" data-testid="prev-chips">
          {['ok', 'warn', 'bad', 'neutral'].map((tono) => <StatusChip key={tono} estado="x" etiqueta={`Tono ${tono}`} tono={tono} />)}
          <StatusChip estado="CONCILIADO" />
          <StatusChip dominio="pedido" estado="PENDING" />
        </div>
      </section>
      <CodigosPreview />
    </main>
  )
}
