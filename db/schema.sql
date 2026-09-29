-- Esquema do Mural OSC (Postgres / Neon). Pode rodar várias vezes: só cria o que falta.

create table if not exists sistemas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  descricao text not null default '',
  tipo text not null check (tipo in ('site', 'programa')),
  endereco text not null,
  icone text not null,
  cor text not null,
  logo text not null default '',
  ordem integer not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz
);

create table if not exists avisos (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  texto text not null default '',
  prioridade text not null check (prioridade in ('urgente', 'importante', 'info')),
  unidade text not null check (unidade in ('todas', 'assis', 'sao-paulo')),
  fixado boolean not null default false,
  expira_em date,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz
);

create table if not exists eventos (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  data date not null,
  hora text not null default '',
  local text not null default '',
  unidade text not null check (unidade in ('todas', 'assis', 'sao-paulo')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz
);

create table if not exists midias (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('foto', 'video')),
  url text not null,
  legenda text not null,
  data date not null,
  unidade text not null check (unidade in ('todas', 'assis', 'sao-paulo')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz
);

-- PCs com o app instalado (o app avisa a cada 5 minutos que está ligado)
create table if not exists pcs (
  id text primary key,
  computador text not null default '',
  usuario text not null default '',
  unidade text not null default 'todas',
  versao text not null default '',
  primeiro_contato timestamptz not null default now(),
  visto_em timestamptz not null default now()
);

create table if not exists config (
  chave text primary key,
  valor jsonb not null,
  atualizado_em timestamptz not null default now()
);

create table if not exists tentativas_login (
  ip text not null,
  em timestamptz not null default now()
);
create index if not exists tentativas_login_ip_em on tentativas_login (ip, em);
create index if not exists avisos_expira on avisos (expira_em);
create index if not exists eventos_data on eventos (data);
