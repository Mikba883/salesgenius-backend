// ============================================================================
// TEST SCRIPT: Verifica inserimento sales_events in Supabase
// ============================================================================
// Questo script testa se le policy RLS permettono correttamente
// l'inserimento di dati nella tabella sales_events
//
// Usage: node test-sales-events.js
// ============================================================================

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

// Inizializza Supabase con SERVICE_ROLE_KEY (come il backend)
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function testSalesEventsInsertion() {
  console.log('🧪 TEST: Verifica inserimento sales_events');
  console.log('='.repeat(80));
  console.log(`📡 Supabase URL: ${process.env.SUPABASE_URL}`);
  console.log(`🔑 SERVICE_KEY presente: ${process.env.SUPABASE_SERVICE_KEY ? 'YES ✅' : 'NO ❌'}`);
  console.log('='.repeat(80));
  console.log('');

  // Dati di test
  const testData = {
    id: crypto.randomUUID(),
    user_id: '44ae536b-1503-4739-bd81-00e856459331', // User ID reale dai log
    meeting_id: `test-meeting-${Date.now()}`,
    organization_id: null,

    // Dati conversazione
    transcript: 'This is a test transcript to verify RLS policies work correctly',
    confidence: 0.95,
    language: 'en',

    // AI Metadata
    intent: 'explore',
    category: 'discovery',
    suggestion: 'This is a test suggestion generated to verify database insertion',

    // Performance Metrics
    latency_ms: 1234,
    tokens_used: 150,
    model: 'gpt-4o-mini',
    confidence_threshold: 0.75,

    // Timestamp
    created_at: new Date().toISOString(),

    // Metadata extra
    metadata: {
      test: true,
      model: 'gpt-4o-mini',
      total_latency_ms: 1234,
      tokens_used: 150,
      confidence_threshold: 0.75
    }
  };

  console.log('📤 Attempting to INSERT test record into sales_events...');
  console.log(`   ID: ${testData.id}`);
  console.log(`   User: ${testData.user_id}`);
  console.log(`   Category/Intent: [${testData.category}/${testData.intent}]`);
  console.log('');

  try {
    const { data, error } = await supabaseAdmin
      .from('sales_events')
      .insert(testData)
      .select();

    if (error) {
      console.error('❌ INSERT FAILED!');
      console.error('   Error code:', error.code);
      console.error('   Error message:', error.message);
      console.error('   Error details:', error.details);
      console.error('   Error hint:', error.hint);
      console.error('');
      console.error('📋 Full error object:');
      console.error(JSON.stringify(error, null, 2));
      console.error('');
      console.error('🔧 POSSIBILI CAUSE:');
      console.error('   1. Tabella sales_events non esiste');
      console.error('   2. RLS policy non permette INSERT da service_role');
      console.error('   3. Schema colonne non corrisponde ai dati inviati');
      console.error('   4. SERVICE_ROLE_KEY non configurata correttamente');
      process.exit(1);
    }

    console.log('✅ INSERT SUCCESSFUL!');
    console.log('');
    console.log('📊 Record salvato:');
    console.log(JSON.stringify(data, null, 2));
    console.log('');
    console.log('='.repeat(80));
    console.log('🎉 TEST PASSED - Le policy RLS funzionano correttamente!');
    console.log('='.repeat(80));
    console.log('');

    // Test 2: Verifica che possiamo leggere il record appena inserito
    console.log('📥 TEST 2: Verifica lettura record...');
    const { data: readData, error: readError } = await supabaseAdmin
      .from('sales_events')
      .select('*')
      .eq('id', testData.id)
      .single();

    if (readError) {
      console.error('❌ LETTURA FALLITA!', readError);
      process.exit(1);
    }

    console.log('✅ LETTURA SUCCESSFUL!');
    console.log('');
    console.log('📊 Record letto:');
    console.log(JSON.stringify(readData, null, 2));
    console.log('');

    // Test 3: Conta quanti sales_events ci sono per questo user
    console.log('📊 TEST 3: Conteggio sales_events per user...');
    const { count, error: countError } = await supabaseAdmin
      .from('sales_events')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', testData.user_id);

    if (countError) {
      console.error('❌ CONTEGGIO FALLITO!', countError);
      process.exit(1);
    }

    console.log(`✅ User ${testData.user_id} ha ${count} sales_events nel database`);
    console.log('');

    console.log('='.repeat(80));
    console.log('✅✅✅ TUTTI I TEST PASSATI! ✅✅✅');
    console.log('='.repeat(80));
    console.log('');
    console.log('🎯 PROSSIMI PASSI:');
    console.log('   1. Il backend ora può salvare correttamente i dati');
    console.log('   2. Testa una sessione reale e controlla i log per:');
    console.log('      - "📤 Attempting to save sales_event to Supabase"');
    console.log('      - "✅ Sales event saved successfully"');
    console.log('   3. Verifica nel Supabase Dashboard che i record appaiano');
    console.log('');

    process.exit(0);

  } catch (error) {
    console.error('❌ UNEXPECTED ERROR!');
    console.error('   Error type:', error?.constructor?.name);
    console.error('   Error message:', error?.message);
    console.error('   Stack trace:', error?.stack);
    console.error('');
    console.error('📋 Full error:');
    console.error(error);
    process.exit(1);
  }
}

// Esegui il test
testSalesEventsInsertion();
