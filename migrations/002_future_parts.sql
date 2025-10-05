-- Migration 002: Future parts normalization (v1.0 feature)
-- This migration is NOT applied in MVP - it's prepared for future use
-- DO NOT RUN THIS MIGRATION IN MVP

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

CREATE INDEX IF NOT EXISTS idx_part_key ON part(brand, part_number, filter_type);
