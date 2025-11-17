// ============================================================================
// TEST TAVILY WEB SEARCH INTEGRATION
// ============================================================================

const { tavily } = require('@tavily/core');

// Check if TAVILY_API_KEY is set
if (!process.env.TAVILY_API_KEY) {
  console.error('❌ ERROR: TAVILY_API_KEY environment variable is not set');
  console.error('   Please set it with: export TAVILY_API_KEY=your_key_here');
  process.exit(1);
}

// Initialize Tavily client
const tavilyClient = tavily({ apiKey: process.env.TAVILY_API_KEY });

// Test function to detect VALUE questions
function detectIfValueQuestion(transcript) {
  const valueKeywords = [
    // English
    'roi', 'return on investment', 'benefit', 'result', 'outcome', 'advantage',
    'comparison', 'compare', 'statistics', 'data', 'research', 'study', 'prove',
    'worth it', 'value', 'impact', 'savings', 'efficiency', 'productivity',
    'how does it work', 'what can', 'what will', 'show me',
    // Italian
    'vantaggi', 'risultati', 'benefici', 'ritorno', 'investimento', 'valore',
    'confronto', 'paragone', 'dati', 'ricerca', 'studio', 'statistiche',
    'risparmio', 'efficienza', 'produttività', 'come funziona', 'cosa può',
  ];

  const lowerTranscript = transcript.toLowerCase();
  return valueKeywords.some(keyword => lowerTranscript.includes(keyword));
}

// Test Tavily search with VALUE question
async function testTavilySearch() {
  console.log('\n' + '='.repeat(80));
  console.log('🧪 TAVILY WEB SEARCH - LIVE TEST');
  console.log('='.repeat(80) + '\n');

  // Test case 1: English VALUE question
  const testTranscript1 = "What kind of ROI can we expect from automation?";
  console.log(`📝 Test Transcript 1: "${testTranscript1}"\n`);

  const isValueQuestion1 = detectIfValueQuestion(testTranscript1);
  console.log(`🔍 Is VALUE question? ${isValueQuestion1 ? '✅ YES' : '❌ NO'}\n`);

  if (isValueQuestion1) {
    try {
      const searchQuery = `B2B sales ROI statistics industry benchmarks ${testTranscript1.substring(0, 100)}`;
      console.log(`📡 Tavily Search Query: "${searchQuery}"\n`);
      console.log(`⏱️  Calling Tavily API (timeout: 5s)...`);

      const startTime = Date.now();

      const searchPromise = tavilyClient.search(searchQuery, {
        searchDepth: 'basic',
        maxResults: 3,
        includeAnswer: true,
      });

      const searchTimeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Tavily search timeout')), 5000)
      );

      const response = await Promise.race([searchPromise, searchTimeout]);

      const elapsed = Date.now() - startTime;
      console.log(`✅ Tavily API responded in ${elapsed}ms\n`);

      console.log('📊 RESULTS:\n');
      console.log(`   Answer: ${response.answer || 'N/A'}\n`);
      console.log(`   Results Count: ${response.results?.length || 0}\n`);

      if (response.results && response.results.length > 0) {
        console.log('   📚 Sources:\n');
        response.results.forEach((result, index) => {
          console.log(`   ${index + 1}. ${result.title}`);
          console.log(`      URL: ${result.url}`);
          console.log(`      Score: ${result.score}`);
          console.log(`      Content Preview: ${result.content?.substring(0, 150)}...`);
          console.log('');
        });

        // Show how it would be formatted for GPT
        console.log('\n' + '-'.repeat(80));
        console.log('📤 FORMATTED CONTEXT FOR GPT:');
        console.log('-'.repeat(80) + '\n');

        const sources = response.results.map((r) => ({
          title: r.title,
          url: r.url,
          content: r.content?.substring(0, 200) || '',
          score: r.score
        }));

        const marketDataContext = `
📊 REAL MARKET DATA (from Tavily Web Search):

${response.answer ? `Quick Answer: ${response.answer}\n` : ''}
Sources found:
${sources.map((s, i) => `${i + 1}. ${s.title}
   Source: ${s.url}
   Data: ${s.content}
`).join('\n')}

⚠️ IMPORTANT: Use these REAL statistics in your suggestion. Cite the source URLs.
Guide seller to reference these specific data points when answering customer.
`;

        console.log(marketDataContext);
      } else {
        console.log('   ⚠️ No results returned by Tavily\n');
      }

    } catch (error) {
      console.error(`❌ ERROR: ${error.message}\n`);
    }
  }

  // Test case 2: Italian VALUE question
  console.log('\n' + '='.repeat(80));
  console.log('🧪 TEST 2 - Italian VALUE Question');
  console.log('='.repeat(80) + '\n');

  const testTranscript2 = "Quali sono i risultati tipici e i benefici dell'automazione?";
  console.log(`📝 Test Transcript 2: "${testTranscript2}"\n`);

  const isValueQuestion2 = detectIfValueQuestion(testTranscript2);
  console.log(`🔍 Is VALUE question? ${isValueQuestion2 ? '✅ YES' : '❌ NO'}\n`);

  if (isValueQuestion2) {
    try {
      const searchQuery = `B2B sales ROI statistics industry benchmarks automation benefits`;
      console.log(`📡 Tavily Search Query: "${searchQuery}"\n`);
      console.log(`⏱️  Calling Tavily API...`);

      const startTime = Date.now();

      const response = await tavilyClient.search(searchQuery, {
        searchDepth: 'basic',
        maxResults: 3,
        includeAnswer: true,
      });

      const elapsed = Date.now() - startTime;
      console.log(`✅ Tavily API responded in ${elapsed}ms\n`);

      console.log('📊 RESULTS:\n');
      console.log(`   Answer: ${response.answer || 'N/A'}\n`);
      console.log(`   Results Count: ${response.results?.length || 0}\n`);

      if (response.results && response.results.length > 0) {
        response.results.forEach((result, index) => {
          console.log(`   ${index + 1}. ${result.title}`);
          console.log(`      URL: ${result.url}`);
          console.log('');
        });
      }

    } catch (error) {
      console.error(`❌ ERROR: ${error.message}\n`);
    }
  }

  // Test case 3: NOT a VALUE question (should not trigger search)
  console.log('\n' + '='.repeat(80));
  console.log('🧪 TEST 3 - NOT a VALUE Question (Control)');
  console.log('='.repeat(80) + '\n');

  const testTranscript3 = "Ciao, come va? Tutto bene?";
  console.log(`📝 Test Transcript 3: "${testTranscript3}"\n`);

  const isValueQuestion3 = detectIfValueQuestion(testTranscript3);
  console.log(`🔍 Is VALUE question? ${isValueQuestion3 ? '✅ YES' : '❌ NO'}\n`);

  if (!isValueQuestion3) {
    console.log('✅ CORRECT: This is a RAPPORT greeting, NOT a VALUE question.');
    console.log('   Tavily search will NOT be triggered for this type of message.\n');
  }

  console.log('\n' + '='.repeat(80));
  console.log('✅ TEST COMPLETED');
  console.log('='.repeat(80) + '\n');
}

// Run the test
testTavilySearch().catch(error => {
  console.error('FATAL ERROR:', error);
  process.exit(1);
});
