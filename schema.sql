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

CREATE TABLE IF NOT EXISTS part (
  id BIGSERIAL PRIMARY KEY,
  brand TEXT NOT NULL,
  part_number TEXT NOT NULL,
  filter_type TEXT NOT NULL CHECK (filter_type IN ('oil','air','cabin','fuel')),
  UNIQUE (brand, part_number, filter_type)
);

CREATE TABLE IF NOT EXISTS xref (
  id BIGSERIAL PRIMARY KEY,
  part_src_id BIGINT REFERENCES part(id) ON DELETE CASCADE,
  part_dst_id BIGINT REFERENCES part(id) ON DELETE CASCADE,
  confidence NUMERIC(3,2) DEFAULT 0.80,
  source_brand TEXT
);

CREATE INDEX IF NOT EXISTS idx_catalog_lookup ON catalog_hit(make, model, year_from, year_to, filter_type);
CREATE INDEX IF NOT EXISTS idx_catalog_engine ON catalog_hit(engine_code, fuel, ac);
CREATE INDEX IF NOT EXISTS idx_part_key ON part(brand, part_number, filter_type);
