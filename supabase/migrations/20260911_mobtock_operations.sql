-- Extensión operativa de Mobtock.
-- Complementa 20260911_mobtock_relational.sql sin borrar datos existentes.

create type public.inventory_tracking as enum ('serialized', 'lot', 'quantity');
create type public.purchase_status as enum ('draft', 'ordered', 'in_transit', 'customs', 'received', 'cancelled');
create type public.transport_mode as enum ('air', 'sea', 'land', 'courier');
create type public.asset_kind as enum ('photo', 'manual', 'render', 'brand', 'document', 'other');

alter table public.products
  add column if not exists tracking public.inventory_tracking not null default 'quantity',
  add column if not exists attributes jsonb not null default '{}'::jsonb,
  add column if not exists reorder_point integer not null default 0;

create table if not exists public.inventory_lots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_id uuid not null references public.products(id),
  lot_number text not null,
  quantity integer not null default 0 check (quantity >= 0),
  received_at date,
  expires_at date,
  sanitary_registration text,
  supplier_batch text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, product_id, lot_number)
);

create index if not exists inventory_lots_expiry_idx
  on public.inventory_lots(organization_id, expires_at) where expires_at is not null;

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  country text,
  document_id text,
  email text,
  phone text,
  address text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  supplier_id uuid references public.suppliers(id),
  order_number text not null,
  status public.purchase_status not null default 'draft',
  transport public.transport_mode,
  currency char(3) not null default 'USD',
  exchange_rate numeric(18,6) not null default 1,
  merchandise_total numeric(18,2) not null default 0,
  freight_cost numeric(18,2) not null default 0,
  customs_cost numeric(18,2) not null default 0,
  other_cost numeric(18,2) not null default 0,
  landed_cost_pyg bigint not null default 0,
  deposit_amount numeric(18,2) not null default 0,
  deposit_paid_at timestamptz,
  ordered_at timestamptz,
  estimated_arrival date,
  received_at timestamptz,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, order_number)
);

create table if not exists public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  product_id uuid not null references public.products(id),
  quantity integer not null check (quantity > 0),
  unit_cost numeric(18,2) not null default 0,
  lot_number text,
  expires_at date
);

create table if not exists public.exchange_rates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  base_currency char(3) not null,
  quote_currency char(3) not null,
  rate numeric(18,6) not null check (rate > 0),
  source text,
  captured_at timestamptz not null default now()
);

create table if not exists public.order_shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  provider text,
  external_id text,
  status text not null default 'pending',
  distance_km numeric(10,2),
  quoted_cost_pyg bigint not null default 0,
  final_cost_pyg bigint,
  address text,
  metadata jsonb not null default '{}'::jsonb,
  dispatched_at timestamptz,
  delivered_at timestamptz
);

create table if not exists public.product_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_id uuid references public.products(id) on delete cascade,
  kind public.asset_kind not null default 'photo',
  name text not null,
  url text not null,
  mime_type text,
  size_bytes bigint,
  checksum text,
  version integer not null default 1,
  approved boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists product_assets_product_idx
  on public.product_assets(organization_id, product_id, approved, version desc);

create table if not exists public.user_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  preferences jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, organization_id)
);

create table if not exists public.user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  ended_at timestamptz,
  ip_hash text,
  user_agent text
);

create table if not exists public.presence (
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  resource_type text not null,
  resource_id uuid not null,
  last_seen_at timestamptz not null default now(),
  primary key (user_id, organization_id, resource_type, resource_id)
);

create table if not exists public.identifier_lookups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  identifier_type text not null,
  identifier_value text not null,
  provider text not null,
  response jsonb not null default '{}'::jsonb,
  fetched_at timestamptz not null default now(),
  requested_by uuid references auth.users(id),
  unique (organization_id, identifier_type, identifier_value, provider)
);

create index if not exists customers_identifier_idx
  on public.customers(organization_id, document_type, document_id);

-- Todas las tablas nuevas quedan cerradas hasta agregar las policies ligadas a
-- organization_users. Esto evita exponer datos por el rol anon durante la
-- migración desde la capa JSON histórica.
alter table public.inventory_lots enable row level security;
alter table public.suppliers enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;
alter table public.exchange_rates enable row level security;
alter table public.order_shipments enable row level security;
alter table public.product_assets enable row level security;
alter table public.user_preferences enable row level security;
alter table public.user_sessions enable row level security;
alter table public.presence enable row level security;
alter table public.identifier_lookups enable row level security;
