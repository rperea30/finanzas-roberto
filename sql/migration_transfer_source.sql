-- Permite saber DE CUÁL ingreso salió cada transferencia.
alter table wallet_transfers add column if not exists income_source_id uuid references income_sources(id) on delete set null;
