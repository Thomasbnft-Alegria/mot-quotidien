-- Add gender column to words table
-- Used for 'nom' category (masculin/féminin)

ALTER TABLE words ADD COLUMN IF NOT EXISTS gender text CHECK (gender IN ('masculin', 'féminin'));
