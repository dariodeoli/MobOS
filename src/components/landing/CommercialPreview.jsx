// Presentation only. The impossible serial and all transaction data are synthetic.
const example = {
  customer: 'Lucía Ejemplo',
  order: 'EJ-001',
  imei: '000000000000000',
  total: 'Gs 5.280.000',
  paid: 'Gs 4.000.000',
  balance: 'Gs 1.280.000',
}

function Phone() {
  return (
    <svg className="preview-phone" viewBox="0 0 110 190" fill="none" aria-hidden="true">
      <rect x="12" y="4" width="86" height="182" rx="19" fill="currentColor" />
      <rect x="17" y="9" width="76" height="172" rx="15" fill="#c6dbcc" />
      <path d="M17 119 93 44v85l-76 42Z" fill="#91bba2" />
      <path d="M17 151 93 90v64l-33 27H32c-8 0-15-7-15-15Z" fill="#658b75" />
      <rect x="38" y="15" width="34" height="10" rx="5" fill="#172b24" />
      <path d="M42 173h26" stroke="#172b24" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

function Selling() {
  return (
    <div className="preview-sale">
      <div className="preview-step">
        <span>01 / VENTA</span>
        <span className="preview-status">Venta registrada</span>
      </div>
      <div className="preview-product">
        <Phone />
        <div>
          <p className="preview-meta">
            Pedido {example.order} · {example.customer}
          </p>
          <h3>iPhone 15</h3>
          <p>128 GB · Verde</p>
          <p className="preview-condition">Equipo + funda de silicona</p>
        </div>
      </div>
      <dl className="preview-receipt">
        <div>
          <dt>Equipo</dt>
          <dd data-money>Gs 5.200.000</dd>
        </div>
        <div>
          <dt>Funda</dt>
          <dd data-money>Gs 80.000</dd>
        </div>
        <div className="preview-total">
          <dt>Total de la venta</dt>
          <dd data-money>{example.total}</dd>
        </div>
      </dl>
    </div>
  )
}
function Stock() {
  return (
    <div className="preview-stock">
      <div className="preview-step">
        <span>02 / UNIDAD</span>
        <span className="preview-status">Vendido</span>
      </div>
      <h3>Una unidad. Su historial.</h3>
      <dl className="preview-details">
        <div>
          <dt>Modelo / color</dt>
          <dd>iPhone 15 · Verde</dd>
        </div>
        <div>
          <dt>Batería</dt>
          <dd>100 %</dd>
        </div>
        <div className="preview-serial">
          <dt>IMEI sintético</dt>
          <dd>{example.imei}</dd>
        </div>
      </dl>
      <p className="preview-meta">Inventario → pedido {example.order}</p>
    </div>
  )
}
function Payment() {
  return (
    <div className="preview-payment">
      <div className="preview-step">
        <span>03 / SEGUIMIENTO</span>
        <span className="preview-status">Pago parcial</span>
      </div>
      <h3>El cobro, con contexto.</h3>
      <dl className="preview-details">
        <div>
          <dt>Transferencia</dt>
          <dd data-money>{example.paid}</dd>
        </div>
        <div>
          <dt>Saldo pendiente</dt>
          <dd data-money>{example.balance}</dd>
        </div>
      </dl>
      <ol className="preview-timeline">
        <li>Venta registrada</li>
        <li>Pago parcial registrado</li>
        <li>Saldo pendiente</li>
      </ol>
      <p className="preview-meta">
        {example.customer} · pedido {example.order}
      </p>
    </div>
  )
}

export default function CommercialPreview({ moment = 'all' }) {
  return (
    <figure
      className={`commercial-preview commercial-preview--${moment}`}
      aria-label="Ejemplo ilustrativo de venta, unidad y seguimiento"
    >
      <div className="preview-heading">
        <span>MobOS / Operación conectada</span>
        <span>Ejemplo EJ-001</span>
      </div>
      <div className="preview-moments">
        {(moment === 'all' || moment === 'sell') && <Selling />}
        {(moment === 'all' || moment === 'stock') && <Stock />}
        {(moment === 'all' || moment === 'payment') && <Payment />}
      </div>
      <figcaption>Vista ilustrativa · datos de ejemplo</figcaption>
    </figure>
  )
}
