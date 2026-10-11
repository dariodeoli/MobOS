import { Select } from '@/components/ui'

// One accessible native selector on mobile; restrained wrapping links on desktop.
export default function SectionSelector({
  items = [],
  value,
  onChange,
  label = 'Sección',
  testId,
  dropdownOnly = false,
}) {
  if (!items.length) return null
  const options = items.map(item => (Array.isArray(item) ? item : [item.id, item.label]))
  return (
    <div data-testid={testId} className="shell-section-selector mb-4 min-w-0">
      <Select
        aria-label={label}
        value={value || ''}
        onChange={event => onChange(event.target.value)}
        className={
          dropdownOnly || options.length > 6
            ? 'min-h-11 w-full lg:max-w-sm'
            : 'min-h-11 w-full lg:hidden'
        }
      >
        {!options.some(([id]) => id === value) && (
          <option value="" disabled>
            Seleccionar sección
          </option>
        )}
        {options.map(([id, text]) => (
          <option key={id} value={id}>
            {text}
          </option>
        ))}
      </Select>
      {!dropdownOnly && options.length <= 6 && (
        <nav
          aria-label={label}
          className="hidden flex-wrap gap-x-5 gap-y-1 border-b border-ink-600 lg:flex"
        >
          {options.map(([id, text]) => (
            <button
              key={id}
              type="button"
              aria-current={value === id ? 'page' : undefined}
              onClick={() => onChange(id)}
              className={`min-h-11 border-b-2 text-sm transition ${value === id ? 'border-fore font-semibold text-fore' : 'border-transparent text-mute hover:text-fore'}`}
            >
              {text}
            </button>
          ))}
        </nav>
      )}
    </div>
  )
}
