-- Railway Migration: Add engine series support
-- This migration adds engine_series and engine_desc_raw columns to catalog_hit table

-- Add columns
ALTER TABLE catalog_hit
  ADD COLUMN IF NOT EXISTS engine_series   TEXT,
  ADD COLUMN IF NOT EXISTS engine_desc_raw TEXT;

-- Add index for engine series disambiguation
CREATE INDEX IF NOT EXISTS idx_catalog_hit_engine_series 
ON catalog_hit(engine_series);

-- Verify migration
SELECT 
  column_name, 
  data_type, 
  is_nullable 
FROM information_schema.columns 
WHERE table_name = 'catalog_hit' 
  AND column_name IN ('engine_series', 'engine_desc_raw')
ORDER BY column_name;


