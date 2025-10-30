// supabaseClient.js
import { createClient } from '@supabase/supabase-js'

// Render userà automaticamente le env SUPABASE_URL e SUPABASE_SERVICE_KEY
export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)
