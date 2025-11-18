-- ============================================================================
-- MIGRATION: Add missing columns to sales_events table
-- ============================================================================
-- Issue: Backend is trying to insert 'metadata' and other columns that don't exist
-- Error: PGRST204 - Could not find the 'metadata' column of 'sales_events'
--
-- This migration adds all missing columns needed by the backend code
-- ============================================================================

-- Add metadata column (JSONB for flexible analytics data)
ALTER TABLE sales_events
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Add transcript_context column (used for session_end events)
ALTER TABLE sales_events
ADD COLUMN IF NOT EXISTS transcript_context TEXT;

-- Add session_id column (for grouping events by session)
ALTER TABLE sales_events
ADD COLUMN IF NOT EXISTS session_id TEXT;

-- Add organization_id column (for multi-tenant support)
ALTER TABLE sales_events
ADD COLUMN IF NOT EXISTS organization_id UUID;

-- Add performance metrics columns
ALTER TABLE sales_events
ADD COLUMN IF NOT EXISTS latency_ms INTEGER;

ALTER TABLE sales_events
ADD COLUMN IF NOT EXISTS tokens_used INTEGER;

ALTER TABLE sales_events
ADD COLUMN IF NOT EXISTS model TEXT;

ALTER TABLE sales_events
ADD COLUMN IF NOT EXISTS confidence_threshold DECIMAL(3,2);

-- Add indexes for common queries
CREATE INDEX IF NOT EXISTS idx_sales_events_session_id
ON sales_events(session_id);

CREATE INDEX IF NOT EXISTS idx_sales_events_organization_id
ON sales_events(organization_id);

CREATE INDEX IF NOT EXISTS idx_sales_events_metadata
ON sales_events USING GIN (metadata);

-- Comment the table for documentation
COMMENT ON TABLE sales_events IS 'Stores AI-generated sales suggestions and performance metrics for re-training and analytics';

COMMENT ON COLUMN sales_events.metadata IS 'JSONB field for flexible analytics data (model, latency, tokens, session_duration, etc.)';
COMMENT ON COLUMN sales_events.transcript_context IS 'Additional context for special events like session_end';
COMMENT ON COLUMN sales_events.session_id IS 'WebSocket session identifier for grouping events';
COMMENT ON COLUMN sales_events.organization_id IS 'Organization/company ID for multi-tenant support';
COMMENT ON COLUMN sales_events.latency_ms IS 'Time taken to generate suggestion in milliseconds';
COMMENT ON COLUMN sales_events.tokens_used IS 'Number of GPT tokens consumed for this suggestion';
COMMENT ON COLUMN sales_events.model IS 'AI model used (e.g., gpt-4o-mini, gpt-4o)';
COMMENT ON COLUMN sales_events.confidence_threshold IS 'Minimum confidence threshold used for generating suggestion';

-- ============================================================================
-- Verify the migration
-- ============================================================================
-- Run this query after migration to verify all columns exist:
--
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'sales_events'
-- ORDER BY ordinal_position;
--
-- ============================================================================
-- Expected columns after migration:
-- ============================================================================
-- id                      | uuid                  | NO
-- user_id                 | uuid                  | NO
-- meeting_id              | text                  | YES
-- transcript              | text                  | YES
-- confidence              | numeric               | YES
-- language                | text                  | YES
-- intent                  | text                  | YES
-- category                | text                  | YES
-- suggestion              | text                  | YES
-- created_at              | timestamp with time zone | YES
-- metadata                | jsonb                 | YES  ← NEW
-- transcript_context      | text                  | YES  ← NEW
-- session_id              | text                  | YES  ← NEW
-- organization_id         | uuid                  | YES  ← NEW
-- latency_ms              | integer               | YES  ← NEW
-- tokens_used             | integer               | YES  ← NEW
-- model                   | text                  | YES  ← NEW
-- confidence_threshold    | numeric               | YES  ← NEW
-- ============================================================================
