-- Mobtock / Fono Mobile Store
-- Modelo relacional objetivo para Supabase + Vercel.
-- La capa `entities` existente se conserva durante la migración; este archivo
-- no borra ni modifica datos históricos.

create extension if not exists pgcrypto;

create type public.user_role as enum ('owner', 'manager', 'seller', 'finance', 'warehouse');
create type public.product_condition as enum ('new', 'used', 'refurbished', 'accessory', 'service');
create type public.inventory_status as enum ('available', 'reserved', 'sold', 'repair', 'defective', 'in_transit');
create type public.order_status as enum ('draft', 'confirmed', 'preparing', 'ready', 'delivering', 'completed', 'cancelled');
create type public.financial_status as enum ('pending', 'partial', 'paid', 'refunded', 'cancelled');
create type public.fulfillment_type as enum ('store_pickup', 'delivery', 'courier');
create type public.warranty_status as enum ('active', 'claimed', 'expired', 'void');

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_users (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.user_role not null default 'seller',
  display_name text not null,
  photo_url text,
  access_code_hash text,
  permissions jsonb not null default '{}'::jsonb,
  schedule jsonb not null default '{}'::jsonb,
  last_access_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  phone text,
  email text,
  document_id text,
  document_type text default 'CI',
  address text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, document_id)
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sku text,
  name text not null,
  category text not null default 'Otros',
  brand text,
  model text,
  color text,
  storage text,
  condition public.product_condition not null default 'new',
  image_url text,
  base_price_pyg bigint not null default 0 check (base_price_pyg >= 0),
  cost_price_pyg bigint not null default 0 check (cost_price_pyg >= 0),
  commission_pyg bigint not null default 0 check (commission_pyg >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists products_org_sku_uidx
  on public.products(organization_id, sku) where sku is not null;
create index if not exists products_search_idx
  on public.products(organization_id, name, model, category);

create table if not exists public.inventory_units (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_id uuid not null references public.products(id),
  imei_serial text not null,
  status public.inventory_status not null default 'available',
  location text,
  battery_percent smallint check (battery_percent between 0 and 100),
  purchase_cost_pyg bigint not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, imei_serial)
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid references public.customers(id),
  seller_id uuid references auth.users(id),
  order_number text not null,
  status public.order_status not null default 'draft',
  financial_status public.financial_status not null default 'pending',
  fulfillment_type public.fulfillment_type not null default 'store_pickup',
  subtotal_pyg bigint not null default 0,
  discount_pyg bigint not null default 0,
  delivery_fee_pyg bigint not null default 0,
  total_pyg bigint generated always as (greatest(0, subtotal_pyg - discount_pyg + delivery_fee_pyg)) stored,
  notes text,
  delivery_address text,
  picked_up_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, order_number)
);

create index if not exists orders_status_idx on public.orders(organization_id, status, created_at desc);
create index if not exists orders_financial_idx on public.orders(organization_id, financial_status, created_at desc);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id),
  inventory_unit_id uuid references public.inventory_units(id),
  quantity integer not null default 1 check (quantity > 0),
  unit_price_pyg bigint not null check (unit_price_pyg >= 0),
  discount_pyg bigint not null default 0 check (discount_pyg >= 0),
  total_pyg bigint generated always as (greatest(0, quantity * unit_price_pyg - discount_pyg)) stored
);

create table if not exists public.order_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  method text not null,
  account_name text,
  amount_pyg bigint not null check (amount_pyg > 0),
  reference text,
  paid_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create index if not exists order_payments_order_idx on public.order_payments(order_id, paid_at);

create table if not exists public.warranties (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  days_covered integer not null default 90 check (days_covered > 0),
  status public.warranty_status not null default 'active',
  starts_at date not null default current_date,
  expires_at date generated always as (starts_at + days_covered) stored,
  notes text,
  claimed_at timestamptz
);

create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  provider text not null,
  external_event_id text not null,
  event_type text not null,
  payload jsonb not null,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider, external_event_id)
);

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

-- RLS: se habilita ahora; las policies se agregan después de crear la función
-- de membresía en la migración de autenticación, evitando acceso anon global.
alter table public.organizations enable row level security;
alter table public.organization_users enable row level security;
alter table public.customers enable row level security;
alter table public.products enable row level security;
alter table public.inventory_units enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_payments enable row level security;
alter table public.warranties enable row level security;
alter table public.webhook_events enable row level security;
alter table public.audit_log enable row level security;
