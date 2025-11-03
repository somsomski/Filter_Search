-- Migration: Allow NULL values in year_to column
-- This allows models that are still in production (year_to = NULL means "ongoing")
-- 
-- Before: year_to INT NOT NULL
-- After:  year_to INT

ALTER TABLE catalog_hit
  ALTER COLUMN year_to DROP NOT NULL;

-- Update comment/documentation
COMMENT ON COLUMN catalog_hit.year_to IS 'Конечный год производства. NULL означает, что модель еще выпускается.';

