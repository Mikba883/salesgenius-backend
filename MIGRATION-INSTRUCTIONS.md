# 🔧 MIGRATION URGENTE: Aggiungi colonne mancanti a sales_events

## 🔴 Problema Attuale

Il backend sta provando a salvare dati nella tabella `sales_events`, ma fallisce con questo errore:

```
❌ Supabase save FAILED!
   Error code: PGRST204
   Error message: Could not find the 'metadata' column of 'sales_events' in the schema cache
```

**Causa**: La tabella `sales_events` esiste e le RLS policies sono corrette, ma **mancano diverse colonne** che il codice backend sta cercando di inserire.

## ✅ Soluzione

Eseguire la migration SQL: `migration-add-sales-events-columns.sql`

### 📋 Step-by-Step

1. **Apri Supabase Dashboard** → SQL Editor

2. **Copia e incolla** il contenuto del file `migration-add-sales-events-columns.sql`

3. **Esegui la query** (RUN)

4. **Verifica** che le colonne siano state aggiunte:
   ```sql
   SELECT column_name, data_type, is_nullable
   FROM information_schema.columns
   WHERE table_name = 'sales_events'
   ORDER BY ordinal_position;
   ```

5. **Dovresti vedere queste nuove colonne**:
   - `metadata` (jsonb)
   - `transcript_context` (text)
   - `session_id` (text)
   - `organization_id` (uuid)
   - `latency_ms` (integer)
   - `tokens_used` (integer)
   - `model` (text)
   - `confidence_threshold` (numeric)

## 🧪 Test Post-Migration

Dopo aver eseguito la migration:

1. **Testa un insert manuale** con tutti i campi:
   ```sql
   INSERT INTO sales_events (
     id, user_id, meeting_id, transcript, confidence,
     language, intent, category, suggestion, created_at,
     metadata, session_id, latency_ms, tokens_used, model, confidence_threshold
   ) VALUES (
     gen_random_uuid(),
     '44ae536b-1503-4739-bd81-00e856459331',
     'test-meeting-123',
     'Test transcript',
     0.95,
     'en',
     'explore',
     'discovery',
     'Test suggestion',
     NOW(),
     '{"model": "gpt-4o-mini", "tokens_used": 150}'::jsonb,
     'session_test_123',
     1234,
     150,
     'gpt-4o-mini',
     0.75
   );
   ```

2. **Se l'insert funziona senza errori**, la migration è riuscita! ✅

3. **Controlla che il record sia stato salvato**:
   ```sql
   SELECT * FROM sales_events ORDER BY created_at DESC LIMIT 1;
   ```

## 🎯 Cosa Aspettarsi

Dopo la migration, nei log di Render dovresti vedere:

```
📤 Attempting to save sales_event to Supabase: [discovery/express_need]
   User: 44ae536b-1503-4739-bd81-00e856459331, Meeting: session_1763488095913_44ae536b
   SUPABASE_SERVICE_KEY present: YES
✅ Sales event saved successfully to Supabase
   Category/Intent: [discovery/express_need]
   Metrics: tokens=3000, latency=1240ms
```

## ⚠️ Note Importanti

- La migration usa `ADD COLUMN IF NOT EXISTS` quindi è **idempotente** (puoi eseguirla più volte senza problemi)
- Gli indici vengono creati con `CREATE INDEX IF NOT EXISTS` per la stessa ragione
- La colonna `metadata` è JSONB per massima flessibilità nei dati analytics
- Tutte le nuove colonne sono **nullable** (`YES`) per compatibilità con eventuali insert esistenti

## 🚀 Rollback (se necessario)

Se per qualche motivo vuoi rimuovere le colonne aggiunte:

```sql
ALTER TABLE sales_events
DROP COLUMN IF EXISTS metadata,
DROP COLUMN IF EXISTS transcript_context,
DROP COLUMN IF EXISTS session_id,
DROP COLUMN IF EXISTS organization_id,
DROP COLUMN IF EXISTS latency_ms,
DROP COLUMN IF EXISTS tokens_used,
DROP COLUMN IF EXISTS model,
DROP COLUMN IF EXISTS confidence_threshold;

DROP INDEX IF EXISTS idx_sales_events_session_id;
DROP INDEX IF EXISTS idx_sales_events_organization_id;
DROP INDEX IF EXISTS idx_sales_events_metadata;
```

## 📞 Supporto

Se la migration fallisce, condividi:
1. Il messaggio di errore completo
2. L'output della query di verifica colonne
3. Il risultato del test insert manuale

---

**Creato da**: Claude AI Assistant
**Data**: 2025-11-18
**Versione backend**: 2.4.3
**Issue**: PGRST204 - Missing metadata column
