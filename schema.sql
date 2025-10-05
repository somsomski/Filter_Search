-- MVP Schema: Only tables needed for current functionality
-- Tables part and xref are moved to migrations/002_future_parts.sql for v1.0

CREATE TABLE IF NOT EXISTS ingestion_batch (
  id BIGSERIAL PRIMARY KEY,
  brand_src TEXT NOT NULL,
  catalog_year INT NOT NULL,
  created_at TIMESTAMP DEFAULT now(),
  log TEXT
);

CREATE TABLE IF NOT EXISTS catalog_hit (
  id BIGSERIAL PRIMARY KEY,
  make TEXT NOT NULL,
  model TEXT NOT NULL,
  year_from INT NOT NULL,
  year_to INT NOT NULL,
  engine_code TEXT,
  fuel TEXT,
  displacement_l NUMERIC(3,1),
  power_hp INT,
  body TEXT,
  ac BOOLEAN,
  filter_type TEXT NOT NULL CHECK (filter_type IN ('oil','air','cabin','fuel')),
  brand_src TEXT NOT NULL,
  part_number TEXT NOT NULL,
  catalog_year INT NOT NULL,
  page TEXT NOT NULL,
  notes TEXT,
  ingestion_batch_id BIGINT REFERENCES ingestion_batch(id) ON DELETE SET NULL
);

-- Indexes for MVP functionality
CREATE INDEX IF NOT EXISTS idx_catalog_lookup ON catalog_hit(make, model, year_from, year_to, filter_type);
CREATE INDEX IF NOT EXISTS idx_catalog_engine ON catalog_hit(engine_code, fuel, ac);
