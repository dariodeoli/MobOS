import SegmentedField from './SegmentedField'

// Selector de período compartido por Ganancias, Ganadores y el Asistente
// (#171, fase 2 de #145): un solo componente para no duplicar pestañas.
const PERIODOS = [
  ['dia', 'Día'],
  ['semana', 'Semana'],
  ['mes', 'Mes'],
  ['anio', 'Año'],
]

export default function PeriodoTabs({ periodo, setPeriodo }) {
  return <SegmentedField value={periodo} onChange={setPeriodo} options={PERIODOS} ariaLabel="Período" />
}
