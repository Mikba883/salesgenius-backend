-- ============================================================================
-- SUPABASE DATABASE SCHEMA
-- ============================================================================
-- Esegui questo SQL nel SQL Editor di Supabase per creare le tabelle necessarie

-- Tabella per tracking sessioni utente
CREATE TABLE IF NOT EXISTS user_sessions (
  id BIGSERIAL PRIMARY KEY,
  session_id UUID NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email TEXT,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  disconnected_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  suggestions_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indici per performance
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_connected_at ON user_sessions(connected_at DESC);

-- Tabella per tracking suggerimenti generati
CREATE TABLE IF NOT EXISTS suggestions (
  id BIGSERIAL PRIMARY KEY,
  suggestion_id UUID NOT NULL UNIQUE,
  session_id UUID NOT NULL REFERENCES user_sessions(session_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('conversational', 'value', 'closing', 'market')),
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indici per performance
CREATE INDEX IF NOT EXISTS idx_suggestions_user_id ON suggestions(user_id);
CREATE INDEX IF NOT EXISTS idx_suggestions_session_id ON suggestions(session_id);
CREATE INDEX IF NOT EXISTS idx_suggestions_category ON suggestions(category);
CREATE INDEX IF NOT EXISTS idx_suggestions_created_at ON suggestions(created_at DESC);

-- Row Level Security (RLS)
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE suggestions ENABLE ROW LEVEL SECURITY;

-- Policy: Gli utenti possono vedere solo le proprie sessioni
CREATE POLICY "Users can view own sessions"
  ON user_sessions
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Gli utenti possono vedere solo i propri suggerimenti
CREATE POLICY "Users can view own suggestions"
  ON suggestions
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Il service role può inserire sessioni (dal backend)
CREATE POLICY "Service role can insert sessions"
  ON user_sessions
  FOR INSERT
  WITH CHECK (true);

-- Policy: Il service role può inserire suggerimenti (dal backend)
CREATE POLICY "Service role can insert suggestions"
  ON suggestions
  FOR INSERT
  WITH CHECK (true);

-- Policy: Il service role può aggiornare sessioni (dal backend)
CREATE POLICY "Service role can update sessions"
  ON user_sessions
  FOR UPDATE
  USING (true);

-- ============================================================================
-- VIEWS UTILI PER ANALYTICS
-- ============================================================================

-- View: Statistiche utente
CREATE OR REPLACE VIEW user_stats AS
SELECT 
  u.id as user_id,
  u.email,
  COUNT(DISTINCT s.session_id) as total_sessions,
  COUNT(sg.id) as total_suggestions,
  AVG(s.duration_seconds) as avg_session_duration,
  MAX(s.connected_at) as last_active
FROM auth.users u
LEFT JOIN user_sessions s ON u.id = s.user_id
LEFT JOIN suggestions sg ON u.id = sg.user_id
GROUP BY u.id, u.email;

-- View: Suggerimenti per categoria
CREATE OR REPLACE VIEW suggestions_by_category AS
SELECT 
  user_id,
  category,
  COUNT(*) as count,
  DATE(created_at) as date
FROM suggestions
GROUP BY user_id, category, DATE(created_at);

-- ============================================================================
-- FUNZIONI HELPER
-- ============================================================================

-- Funzione per aggiornare durata sessione quando si disconnette
CREATE OR REPLACE FUNCTION update_session_duration()
RETURNS TRIGGER AS $$
BEGIN
  NEW.duration_seconds = EXTRACT(EPOCH FROM (NEW.disconnected_at - NEW.connected_at));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_session_duration
BEFORE UPDATE ON user_sessions
FOR EACH ROW
WHEN (NEW.disconnected_at IS NOT NULL AND OLD.disconnected_at IS NULL)
EXECUTE FUNCTION update_session_duration();

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

-- Permetti al service role di fare tutto
GRANT ALL ON user_sessions TO service_role;
GRANT ALL ON suggestions TO service_role;
GRANT ALL ON user_stats TO service_role;
GRANT ALL ON suggestions_by_category TO service_role;

-- Permetti agli utenti autenticati di leggere le proprie view
GRANT SELECT ON user_stats TO authenticated;
GRANT SELECT ON suggestions_by_category TO authenticated;

-- ============================================================================
-- SEED DATA (opzionale - per testing)
-- ============================================================================

-- Nessun seed data necessario - le tabelle si popoleranno automaticamente
-- quando gli utenti si connettono

-- ============================================================================
-- QUERIES UTILI PER MONITORING
-- ============================================================================

-- Sessioni attive (connesse negli ultimi 5 minuti)
-- SELECT * FROM user_sessions 
-- WHERE disconnected_at IS NULL 
--   AND connected_at > NOW() - INTERVAL '5 minutes';

-- Top utenti per numero di suggerimenti
-- SELECT user_email, suggestions_count 
-- FROM user_sessions 
-- ORDER BY suggestions_count DESC 
-- LIMIT 10;

-- Distribuzione suggerimenti per categoria (oggi)
-- SELECT category, COUNT(*) as count
-- FROM suggestions
-- WHERE DATE(created_at) = CURRENT_DATE
-- GROUP BY category
-- ORDER BY count DESC;

-- ============================================================================
-- SETUP COMPLETO!
-- ============================================================================
-- Dopo aver eseguito questo script:
-- 1. Le tabelle sono create con RLS abilitato
-- 2. Le policy permettono agli utenti di vedere solo i propri dati
-- 3. Il service role (backend) può inserire/aggiornare tutto
-- 4. Le view forniscono analytics pronte all'uso
