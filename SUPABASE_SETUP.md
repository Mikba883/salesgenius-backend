# 🔐 Guida Setup Supabase + Autenticazione

Questa guida ti porta dall'account Supabase zero al sistema completamente autenticato.

---

## 📋 Cosa Fa l'Autenticazione

Con Supabase integrato, SalesGenius può:

✅ **Identificare gli utenti** - Sapere chi sta usando il sistema  
✅ **Tracciare sessioni** - Quante ore, quando, quanto usato  
✅ **Salvare storico** - Tutti i suggerimenti generati per utente  
✅ **Analytics** - Vedere quali categorie sono più usate  
✅ **Rate limiting** - Limitare utilizzo per utente  
✅ **Billing** - Addebitare in base all'uso  

---

## 🚀 Setup Step-by-Step

### Step 1: Crea Account Supabase

1. Vai su [supabase.com](https://supabase.com)
2. Clicca "Start your project"
3. Crea un nuovo progetto:
   - Nome: `salesgenius`
   - Database Password: **SALVALA!**
   - Region: scegli la più vicina ai tuoi utenti

⏱️ Attendi ~2 minuti per il provisioning

---

### Step 2: Ottieni le Chiavi API

1. Vai in **Settings → API**
2. Copia queste 3 chiavi:

```
Project URL: https://xxxxx.supabase.co
anon public: eyJhbGciOiJIUzI1... (pubblica - per il client)
service_role: eyJhbGciOiJIUzI1... (SEGRETA - solo server!)
```

⚠️ **IMPORTANTE:** La `service_role` key è SEGRETA! Mai condividerla o metterla nel client!

---

### Step 3: Configura il Database

1. Vai in **SQL Editor** (sidebar sinistra)
2. Clicca "New query"
3. **Copia-incolla tutto** il contenuto di `supabase-schema.sql`
4. Clicca "Run" (o CMD/CTRL + Enter)

✅ Dovresti vedere: "Success. No rows returned"

Questo crea:
- ✅ Tabella `user_sessions` (tracking connessioni)
- ✅ Tabella `suggestions` (storico suggerimenti)
- ✅ Row Level Security (RLS) policies
- ✅ Views per analytics
- ✅ Triggers automatici

---

### Step 4: Abilita Google OAuth (Consigliato)

1. Vai in **Authentication → Providers**
2. Abilita **Google**
3. Crea OAuth credentials su [Google Cloud Console](https://console.cloud.google.com/):
   - APIs & Services → Credentials → Create OAuth 2.0 Client ID
   - Application type: Web application
   - Authorized redirect URIs: 
     ```
     https://xxxxx.supabase.co/auth/v1/callback
     ```
4. Copia Client ID e Client Secret
5. Incolla in Supabase Google provider settings
6. **Save**

✅ Ora gli utenti possono fare login con Google!

**Alternative providers:** Email/Password, GitHub, Azure, ecc.

---

### Step 5: Configura Environment Variables

#### Server (backend):
```env
# server/.env
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6... (SERVICE ROLE - segreta!)
```

#### Client (frontend):
```env
# .env.local
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... (ANON KEY - pubblica)
```

⚠️ **Non confondere le chiavi!** SERVICE_ROLE solo sul server!

---

### Step 6: Installa Dipendenze

```bash
# Backend
cd server
npm install @supabase/supabase-js
npm run dev

# Frontend
cd ../your-nextjs-app
npm install @supabase/supabase-js
npm run dev
```

---

### Step 7: Test Autenticazione

1. Apri `http://localhost:3000/stream`
2. Dovresti vedere la sezione "Non autenticato"
3. Clicca "Login con Google"
4. Autorizza l'app
5. Dovresti essere reindirizzato e vedere "Autenticato come [tuo-email]"
6. Clicca "Avvia Condivisione"
7. Controlla i log del server - dovresti vedere:
   ```
   🔐 Authenticating user...
   ✅ User authenticated: [email] ([user-id])
   ```

---

## 📊 Verifica Dati in Supabase

### Controlla Sessioni

1. Vai in **Table Editor → user_sessions**
2. Dovresti vedere una riga con:
   - `session_id`: UUID univoco
   - `user_id`: Il tuo user ID
   - `user_email`: La tua email
   - `connected_at`: Timestamp connessione

### Controlla Suggerimenti

1. Usa l'app e genera qualche suggerimento
2. Vai in **Table Editor → suggestions**
3. Dovresti vedere righe con:
   - `category`: conversational/value/closing/market
   - `text`: Il testo del suggerimento
   - `user_id`: Il tuo user ID

---

## 🔍 Analytics Query Utili

### Sessioni di oggi
```sql
SELECT user_email, connected_at, duration_seconds 
FROM user_sessions 
WHERE DATE(connected_at) = CURRENT_DATE
ORDER BY connected_at DESC;
```

### Top categorie suggerimenti (ultima settimana)
```sql
SELECT category, COUNT(*) as count
FROM suggestions
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY category
ORDER BY count DESC;
```

### Utenti più attivi
```sql
SELECT * FROM user_stats 
ORDER BY total_suggestions DESC 
LIMIT 10;
```

Puoi eseguire queste query in **SQL Editor** su Supabase.

---

## 🚀 Deploy in Produzione

### Render (Backend)

Aggiungi queste env vars su Render:
```
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=tua_service_role_key
```

### Vercel (Frontend)

Aggiungi queste env vars su Vercel:
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tua_anon_key
NEXT_PUBLIC_WS_URL=wss://tuo-backend.onrender.com
```

---

## 🔐 Sicurezza Best Practices

✅ **Mai** committare chiavi in Git  
✅ **Mai** esporre SERVICE_ROLE_KEY nel client  
✅ Usa **RLS policies** per proteggere i dati  
✅ **Ruota le chiavi** ogni 6 mesi  
✅ Abilita **2FA** su account Supabase  
✅ **Monitora** log per attività sospette  

---

## 🆘 Troubleshooting

### "Authentication failed"
- ✅ Verifica che le chiavi siano corrette
- ✅ Verifica che il provider OAuth sia abilitato
- ✅ Controlla redirect URLs in Google Console

### "Not authenticated" quando provo a condividere
- ✅ Fai login prima di premere "Avvia Condivisione"
- ✅ Verifica che il JWT sia valido (controlla log server)

### Nessun dato nelle tabelle
- ✅ Verifica che lo schema SQL sia stato eseguito
- ✅ Controlla RLS policies (potrebbero bloccare insert)
- ✅ Guarda log server per errori durante insert

### "relation does not exist"
- ✅ Hai eseguito `supabase-schema.sql`?
- ✅ Sei connesso al database giusto?

---

## 📈 Funzionalità Avanzate (Opzionali)

### Email Notifications
Invia email quando utente ha X suggerimenti generati:
```typescript
// Nel server dopo insert suggestion
if (suggestionCount % 10 === 0) {
  await supabase.auth.admin.sendEmail({
    to: user.email,
    subject: 'SalesGenius Stats',
    body: `Hai generato ${suggestionCount} suggerimenti!`
  });
}
```

### Rate Limiting per Utente
```typescript
// Controlla usage prima di generare suggerimento
const { count } = await supabase
  .from('suggestions')
  .select('*', { count: 'exact', head: true })
  .eq('user_id', userId)
  .gte('created_at', new Date(Date.now() - 24*60*60*1000).toISOString());

if (count > 100) {
  sendJSON(ws, { type: 'error', message: 'Daily limit reached' });
  return;
}
```

### Dashboard Analytics
Crea una pagina Next.js che mostra:
- Numero sessioni utente
- Suggerimenti per categoria
- Tempo totale utilizzo
- Grafico utilizzo nel tempo

Query i dati da Supabase:
```typescript
const { data: stats } = await supabase
  .from('user_stats')
  .select('*')
  .eq('user_id', user.id)
  .single();
```

---

## ✅ Checklist Setup Completo

- [ ] Account Supabase creato
- [ ] Chiavi API copiate (URL + anon + service_role)
- [ ] Schema SQL eseguito (`supabase-schema.sql`)
- [ ] Google OAuth configurato
- [ ] Env vars configurate (server + client)
- [ ] Dipendenze installate (`@supabase/supabase-js`)
- [ ] Test login funzionante
- [ ] Dati appaiono nelle tabelle
- [ ] Deploy produzione con env vars corrette

**Tutto fatto? Congratulazioni! 🎉**

Il tuo SalesGenius è ora completamente autenticato e traccia tutto! 🔐📊

---

## 💰 Costi Supabase

**Free Tier:**
- 500 MB database
- 50,000 utenti MAU
- 2 GB file storage
- Perfetto per iniziare! ✅

**Pro ($25/mese):**
- 8 GB database
- 100,000 MAU
- 100 GB storage
- Daily backups
- Email support

---

**Domande?** Controlla la [Supabase Docs](https://supabase.com/docs) o i log del server!
