-- Migration: Add engine series support
-- Adds engine_series and engine_desc_raw columns to catalog_hit table

ALTER TABLE catalog_hit
  ADD COLUMN engine_series   TEXT,
  ADD COLUMN engine_desc_raw TEXT;

-- Optional index for engine series disambiguation
CREATE INDEX IF NOT EXISTS idx_catalog_hit_engine_series ON catalog_hit(engine_series);
