"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const ws_1 = require("ws");
const sdk_1 = require("@deepgram/sdk");
const dotenv_1 = require("dotenv");
const gpt_handler_1 = require("./gpt-handler");
const supabase_js_1 = require("@supabase/supabase-js");
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const openai_1 = __importDefault(require("openai"));
(0, dotenv_1.config)();
const openai = new openai_1.default({
    apiKey: process.env.OPENAI_API_KEY,
});
const supabaseAuth = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const supabaseAdmin = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const activeSessions = new Map();
const deepgramClient = (0, sdk_1.createClient)(process.env.DEEPGRAM_API_KEY);
const app = (0, express_1.default)();
app.use(express_1.default.json());
const PORT = process.env.PORT || 8080;
console.log('🚀 Server starting with DEBUG LOGGING ENABLED - Version 2.4.3 - Force Rebuild');
const apiLimiter = (0, express_rate_limit_1.default)({
    windowMs: 5 * 60 * 1000,
    max: 100,
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});
const debugLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: 'Too many debug requests, please try again later.',
});
app.use(apiLimiter);
const userConnections = new Map();
const MAX_CONNECTIONS_PER_USER = 2;
const userSuggestions = new Map();
const MAX_SUGGESTIONS_PER_5MIN = 10;
app.get('/', (req, res) => {
    res.status(200).json({
        status: 'ok',
        service: 'salesgenius-backend',
        version: '2.4.3',
        uptime: Math.floor(process.uptime()),
        connections: activeSessions.size,
        timestamp: new Date().toISOString()
    });
});
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        uptime: Math.floor(process.uptime()),
        activeSessions: activeSessions.size,
        timestamp: new Date().toISOString()
    });
});
app.post('/debug-token', debugLimiter, async (req, res) => {
    if (process.env.NODE_ENV === 'production') {
        return res.status(403).json({ error: 'Debug endpoint disabled in production' });
    }
    try {
        const { token } = req.body;
        if (!token) {
            return res.status(400).json({ error: 'No token provided in request body' });
        }
        const parts = token.split('.');
        if (parts.length !== 3) {
            return res.status(400).json({ error: 'Invalid JWT format - must have 3 parts separated by dots' });
        }
        const header = JSON.parse(Buffer.from(parts[0], 'base64').toString());
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
        const { data: { user }, error } = await supabaseAuth.auth.getUser(token);
        let diagnosis = '';
        if (payload.app_metadata && !payload.role) {
            diagnosis = '❌ CUSTOM JWT - Non è un token Supabase. State usando jwt.sign() invece di supabase.auth.getSession()';
        }
        else if (payload.role === 'authenticated' && payload.aud === 'authenticated') {
            if (error) {
                diagnosis = '⚠️ Token sembra Supabase ma validazione fallisce - Verificare SUPABASE_ANON_KEY nel backend o che il token non sia scaduto';
            }
            else {
                diagnosis = '✅ Token Supabase valido! Questo dovrebbe funzionare.';
            }
        }
        else if (header.kid && !payload.role) {
            diagnosis = '⚠️ Token ha kid ma manca role - Potrebbe essere service_role_key invece di access_token';
        }
        else if (payload.role === 'anon') {
            diagnosis = '❌ State inviando ANON_KEY invece del session.access_token dell\'utente!';
        }
        else if (payload.role === 'service_role') {
            diagnosis = '❌ State inviando SERVICE_ROLE_KEY invece del session.access_token dell\'utente!';
        }
        else {
            diagnosis = '❓ Formato token non riconosciuto - Verificare che provenga da supabase.auth.getSession()';
        }
        return res.json({
            success: true,
            tokenInfo: {
                header,
                payload: {
                    ...payload,
                    email: payload.email ? '***@***' : undefined
                },
                hasKid: !!header.kid,
                hasRole: !!payload.role,
                hasAud: !!payload.aud,
                hasAppMetadata: !!payload.app_metadata,
                roleValue: payload.role || 'missing',
                audValue: payload.aud || 'missing'
            },
            supabaseValidation: {
                isValid: !error && !!user,
                error: error?.message || null,
                errorCode: error?.['code'] || null,
                userId: user?.id || null
            },
            diagnosis
        });
    }
    catch (error) {
        return res.status(500).json({
            success: false,
            error: 'Error parsing token',
            message: error.message
        });
    }
});
app.get('/status', (req, res) => {
    res.status(200).json({
        service: 'salesgenius-backend',
        version: '2.4.3',
        environment: process.env.NODE_ENV || 'development',
        supabaseConnected: !!process.env.SUPABASE_URL,
        deepgramConnected: !!process.env.DEEPGRAM_API_KEY,
        openaiConnected: !!process.env.OPENAI_API_KEY,
        activeSessions: activeSessions.size,
        uptime: Math.floor(process.uptime()),
        memory: process.memoryUsage(),
        timestamp: new Date().toISOString()
    });
});
const server = app.listen(PORT, () => {
    console.log(`🚀 SalesGenius Backend v2.4.3-DEBUG running on port ${PORT}`);
    console.log(`✅ Supabase connected to: ${process.env.SUPABASE_URL}`);
    console.log(`✅ Health check available at: http://localhost:${PORT}/health`);
    console.log(`🔍 Debug token endpoint: http://localhost:${PORT}/debug-token (POST)`);
    console.log(`⚡ FULL DEBUG LOGGING ACTIVE - Every message will be logged`);
});
const wss = new ws_1.WebSocketServer({
    server,
    path: '/stream-audio'
});
async function authenticateUser(authToken) {
    try {
        const { data: { user }, error } = await supabaseAuth.auth.getUser(authToken);
        if (error || !user) {
            console.error('Auth error:', error);
            return null;
        }
        const { data: profile, error: profileError } = await supabaseAdmin
            .from('user_profiles')
            .select('*')
            .eq('user_id', user.id)
            .single();
        if (profileError) {
            console.error('Profile error:', profileError);
            return { userId: user.id, isPremium: false };
        }
        const isPremium = profile?.is_premium === true;
        console.log(`✅ User authenticated: ${user.id}, Premium: ${isPremium}`);
        return { userId: user.id, isPremium };
    }
    catch (error) {
        console.error('Authentication error:', error);
        return null;
    }
}
async function saveSuggestion(session, category, suggestion, transcriptContext, confidence) {
    try {
        const { error } = await supabaseAdmin
            .from('sales_events')
            .insert({
            id: crypto.randomUUID(),
            user_id: session.userId,
            session_id: session.sessionId,
            category,
            suggestion,
            transcript_context: transcriptContext,
            confidence,
            created_at: new Date().toISOString(),
            metadata: {
                model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
                processing_time_ms: Date.now() - session.startTime.getTime()
            }
        });
        if (error) {
            console.error('Error saving suggestion:', error);
        }
        else {
            console.log(`💾 Suggestion saved: [${category}] ${suggestion.substring(0, 50)}...`);
        }
    }
    catch (error) {
        console.error('Unexpected error saving suggestion:', error);
    }
}
wss.on('connection', async (ws) => {
    console.log('🔌 New WebSocket connection');
    let deepgramConnection = null;
    let deepgramReady = false;
    let audioBuffer = [];
    let audioPacketsSent = 0;
    let audioPacketsReceived = 0;
    let transcriptBuffer = '';
    let lastSuggestionTime = 0;
    let lastTranscriptTime = Date.now();
    const SUGGESTION_DEBOUNCE_MS = 10000;
    const MIN_CONFIDENCE = 0.75;
    const MIN_BUFFER_LENGTH = 25;
    const DEAD_AIR_THRESHOLD_MS = 5000;
    const CRITICAL_OBJECTION_PHRASES = [
        'costa troppo', 'troppo caro', 'troppo costoso', 'non mi interessa', 'ci devo pensare',
        'non ho budget', 'non abbiamo soldi', 'troppo per noi', 'fuori budget',
        'too expensive', 'too much', 'not interested', 'need to think', 'no budget',
        'can\'t afford', 'too costly', 'out of budget'
    ];
    let currentUserId = null;
    let deadAirCheckSent = false;
    let lastSpeaker = null;
    const deadAirTimer = setInterval(async () => {
        const timeSinceLastTranscript = Date.now() - lastTranscriptTime;
        if (timeSinceLastTranscript > DEAD_AIR_THRESHOLD_MS && !deadAirCheckSent && transcriptBuffer.length > 0) {
            console.log(`\n${'='.repeat(80)}`);
            console.log('🔇 DEAD AIR DETECTED - 5 secondi di silenzio');
            console.log(`   Time since last transcript: ${(timeSinceLastTranscript / 1000).toFixed(1)}s`);
            console.log(`   Buffer: "${transcriptBuffer.substring(0, 100)}..."`);
            console.log(`${'='.repeat(80)}\n`);
            deadAirCheckSent = true;
            const session = activeSessions.get(ws);
            if (session) {
                try {
                    const reEngagementPrompt = `The conversation has gone silent for 5+ seconds after this: "${transcriptBuffer.slice(-200)}". Suggest a polite, open-ended question to re-engage the prospect and continue the discussion naturally.`;
                    await (0, gpt_handler_1.handleGPTSuggestion)(reEngagementPrompt, ws, 'en', async (category, suggestion) => {
                        if (session.userId !== 'demo-user') {
                            await saveSuggestion(session, 'rapport', suggestion, transcriptBuffer.slice(-500), 0.9);
                        }
                    });
                    lastSuggestionTime = Date.now();
                }
                catch (error) {
                    console.error('❌ Error generating dead air suggestion:', error);
                }
            }
        }
        if (timeSinceLastTranscript <= DEAD_AIR_THRESHOLD_MS) {
            deadAirCheckSent = false;
        }
    }, 2000);
    ws.on('message', async (message) => {
        console.log(`📨 RAW MESSAGE: ${message.length} bytes, isBuffer: ${Buffer.isBuffer(message)}`);
        try {
            if (message.length < 2000) {
                try {
                    const json = JSON.parse(message.toString());
                    if (json.op === 'hello') {
                        console.log('👋 Hello from client:', { op: json.op, hasToken: !!json.token });
                        if (json.token) {
                            const authResult = await authenticateUser(json.token);
                            if (!authResult) {
                                console.error('❌ Authentication failed');
                                ws.send(JSON.stringify({
                                    type: 'auth_failed',
                                    reason: 'Invalid token'
                                }));
                                ws.close(1008, 'Authentication failed');
                                return;
                            }
                            if (!authResult.isPremium) {
                                console.log('⚠️ User is not premium');
                                ws.send(JSON.stringify({
                                    type: 'auth_failed',
                                    reason: 'Not premium'
                                }));
                                ws.close(1008, 'Premium required');
                                return;
                            }
                            const currentConnections = userConnections.get(authResult.userId) || 0;
                            if (currentConnections >= MAX_CONNECTIONS_PER_USER) {
                                console.log(`❌ User ${authResult.userId} exceeded max connections (${currentConnections}/${MAX_CONNECTIONS_PER_USER})`);
                                ws.send(JSON.stringify({
                                    type: 'auth_failed',
                                    reason: 'Too many active connections. Close other tabs and try again.'
                                }));
                                ws.close(1008, 'Max connections exceeded');
                                return;
                            }
                            userConnections.set(authResult.userId, currentConnections + 1);
                            currentUserId = authResult.userId;
                            const session = {
                                userId: authResult.userId,
                                isPremium: authResult.isPremium,
                                sessionId: `session_${Date.now()}_${authResult.userId.substring(0, 8)}`,
                                startTime: new Date(),
                                ws
                            };
                            activeSessions.set(ws, session);
                            console.log(`✅ Premium user session created: ${session.sessionId} (connections: ${currentConnections + 1}/${MAX_CONNECTIONS_PER_USER})`);
                            ws.send(JSON.stringify({
                                type: 'capture_ready',
                                sessionId: session.sessionId,
                                isPremium: true
                            }));
                        }
                        else {
                            console.log('⚠️ No token provided - demo mode');
                            const demoSession = {
                                userId: 'demo-user',
                                isPremium: false,
                                sessionId: `demo_${Date.now()}`,
                                startTime: new Date(),
                                ws
                            };
                            activeSessions.set(ws, demoSession);
                            ws.send(JSON.stringify({
                                type: 'capture_ready',
                                sessionId: demoSession.sessionId,
                                isPremium: false
                            }));
                        }
                        return;
                    }
                    if (json.op === 'auth') {
                        console.log('🔐 Auth message received:', { op: json.op, hasJwt: !!json.jwt });
                        if (json.jwt) {
                            const authResult = await authenticateUser(json.jwt);
                            if (!authResult) {
                                console.error('❌ Authentication failed');
                                ws.send(JSON.stringify({
                                    type: 'auth_failed',
                                    reason: 'Invalid token'
                                }));
                                ws.close(1008, 'Authentication failed');
                                return;
                            }
                            if (!authResult.isPremium) {
                                console.log('⚠️ User is not premium');
                                ws.send(JSON.stringify({
                                    type: 'auth_failed',
                                    reason: 'Not premium'
                                }));
                                ws.close(1008, 'Premium required');
                                return;
                            }
                            const currentConnections = userConnections.get(authResult.userId) || 0;
                            if (currentConnections >= MAX_CONNECTIONS_PER_USER) {
                                console.log(`❌ User ${authResult.userId} exceeded max connections (${currentConnections}/${MAX_CONNECTIONS_PER_USER})`);
                                ws.send(JSON.stringify({
                                    type: 'auth_failed',
                                    reason: 'Too many active connections. Close other tabs and try again.'
                                }));
                                ws.close(1008, 'Max connections exceeded');
                                return;
                            }
                            userConnections.set(authResult.userId, currentConnections + 1);
                            currentUserId = authResult.userId;
                            const session = {
                                userId: authResult.userId,
                                isPremium: authResult.isPremium,
                                sessionId: `session_${Date.now()}_${authResult.userId.substring(0, 8)}`,
                                startTime: new Date(),
                                ws
                            };
                            activeSessions.set(ws, session);
                            console.log(`✅ Premium user authenticated via auth message: ${session.sessionId} (connections: ${currentConnections + 1}/${MAX_CONNECTIONS_PER_USER})`);
                            ws.send(JSON.stringify({
                                type: 'auth_success',
                                sessionId: session.sessionId,
                                isPremium: true
                            }));
                        }
                        else {
                            console.log('⚠️ Auth message without jwt');
                            ws.send(JSON.stringify({
                                type: 'auth_failed',
                                reason: 'No JWT provided'
                            }));
                        }
                        return;
                    }
                    if (json.op === 'audio') {
                        console.log('🎧 Audio header received (ignored)');
                        return;
                    }
                    console.log('❓ Unknown JSON message:', json);
                }
                catch (jsonError) {
                    console.log('🔄 JSON parse failed, treating as binary audio data');
                }
            }
            const session = activeSessions.get(ws);
            if (!session) {
                console.warn(`⚠️ Received data without active session! Size: ${message.length} bytes`);
                return;
            }
            console.log(`✅ Session found: ${session.sessionId}`);
            if (message.length >= 2000) {
                console.log(`🎵 Audio packet received: ${message.length} bytes`);
            }
            else if (message.length > 0) {
                console.log(`📊 Small packet received: ${message.length} bytes (not typical audio size)`);
            }
            if (!deepgramConnection) {
                console.log('🎤 Initializing Deepgram connection...');
                if (!process.env.DEEPGRAM_API_KEY) {
                    console.error('❌ CRITICAL: DEEPGRAM_API_KEY is not set!');
                    ws.send(JSON.stringify({
                        type: 'transcription_error',
                        error: 'Server configuration error. Please contact support.'
                    }));
                    return;
                }
                console.log(`🔑 Using Deepgram API key: ${process.env.DEEPGRAM_API_KEY.substring(0, 8)}...`);
                try {
                    deepgramConnection = deepgramClient.listen.live({
                        encoding: 'linear16',
                        sample_rate: 48000,
                        channels: 1,
                        language: 'multi',
                        punctuate: true,
                        smart_format: true,
                        model: 'nova-2',
                        diarize: true,
                        interim_results: true,
                        utterance_end_ms: 3000,
                        endpointing: 600,
                        vad_events: true,
                    });
                    console.log('✅ Deepgram connection object created successfully');
                }
                catch (initError) {
                    console.error('❌ CRITICAL: Failed to create Deepgram connection:', initError);
                    ws.send(JSON.stringify({
                        type: 'transcription_error',
                        error: 'Failed to initialize audio transcription service.'
                    }));
                    return;
                }
                deepgramConnection.on(sdk_1.LiveTranscriptionEvents.Open, () => {
                    console.log('✅ Deepgram connection opened');
                    deepgramReady = true;
                    if (audioBuffer.length > 0) {
                        console.log(`📤 Sending ${audioBuffer.length} buffered audio packets to Deepgram`);
                        audioBuffer.forEach(packet => {
                            if (deepgramConnection && deepgramConnection.getReadyState() === 1) {
                                deepgramConnection.send(packet);
                                audioPacketsSent++;
                            }
                        });
                        console.log(`   ✅ Total packets sent to Deepgram so far: ${audioPacketsSent}`);
                        audioBuffer = [];
                    }
                });
                deepgramConnection.on(sdk_1.LiveTranscriptionEvents.Transcript, async (data) => {
                    console.log('🎤 Deepgram Transcript event received:', JSON.stringify(data, null, 2));
                    const transcript = data.channel?.alternatives[0]?.transcript;
                    const isFinal = data.is_final;
                    const confidence = data.channel?.alternatives[0]?.confidence || 0;
                    const detectedLanguage = data.channel?.alternatives[0]?.language || data.channel?.detected_language || 'unknown';
                    console.log(`🔍 Transcript details - Text: "${transcript}", isFinal: ${isFinal}, confidence: ${confidence}, language: ${detectedLanguage}`);
                    if (transcript && transcript.length > 0) {
                        console.log(`📝 [${isFinal ? 'FINAL' : 'INTERIM'}] ${transcript} (confidence: ${confidence})`);
                        if (isFinal) {
                            transcriptBuffer += ' ' + transcript;
                            lastTranscriptTime = Date.now();
                            console.log(`📊 Buffer length: ${transcriptBuffer.length} chars`);
                            const currentSpeaker = data.channel?.alternatives[0]?.words?.[0]?.speaker ?? null;
                            const isQuestion = transcript.trim().endsWith('?');
                            const speakerChanged = lastSpeaker !== null && currentSpeaker !== null && lastSpeaker !== currentSpeaker;
                            console.log(`🎭 Speaker info - Current: ${currentSpeaker}, Last: ${lastSpeaker}, Changed: ${speakerChanged}, IsQuestion: ${isQuestion}`);
                            if (currentSpeaker !== null) {
                                lastSpeaker = currentSpeaker;
                            }
                            if (isQuestion && speakerChanged && confidence >= MIN_CONFIDENCE) {
                                console.log(`\n${'='.repeat(80)}`);
                                console.log('❓ SMART CONTEXT: Customer question detected');
                                console.log(`   Question: "${transcript}"`);
                                console.log(`   Speaker: ${currentSpeaker} (previous: ${lastSpeaker})`);
                                console.log(`${'='.repeat(80)}\n`);
                                const session = activeSessions.get(ws);
                                if (session) {
                                    try {
                                        console.log('🔍 Calling GPT for smart evaluation...');
                                        const evaluationResponse = await openai.chat.completions.create({
                                            model: 'gpt-4o-mini',
                                            messages: [
                                                {
                                                    role: 'system',
                                                    content: 'You are a sales context analyzer. Determine if a customer question requires factual data/research to answer.'
                                                },
                                                {
                                                    role: 'user',
                                                    content: `Is this a direct technical question from the prospect asking about price, features, ROI, guarantees, or comparisons that would benefit from real market data?\n\nQuestion: "${transcript}"\n\nRespond with JSON: {"needs_data": true/false, "category": "value|objection|rapport|discovery|closing", "reason": "brief explanation"}`
                                                }
                                            ],
                                            response_format: { type: 'json_object' },
                                            temperature: 0.3,
                                            max_tokens: 150,
                                        });
                                        const evaluation = JSON.parse(evaluationResponse.choices[0]?.message?.content || '{}');
                                        console.log(`✅ GPT Evaluation:`, JSON.stringify(evaluation, null, 2));
                                        if (evaluation.needs_data && (evaluation.category === 'value' || evaluation.category === 'objection')) {
                                            console.log(`🔎 VALUE/OBJECTION question → Activating Tavily search`);
                                            const timeSinceLastSuggestion = Date.now() - lastSuggestionTime;
                                            if (timeSinceLastSuggestion > 3000) {
                                                lastSuggestionTime = Date.now();
                                                await (0, gpt_handler_1.handleGPTSuggestion)(transcript, ws, detectedLanguage, async (category, suggestion) => {
                                                    if (session.userId !== 'demo-user') {
                                                        await saveSuggestion(session, category, suggestion, transcript, confidence);
                                                    }
                                                });
                                                return;
                                            }
                                        }
                                        else {
                                            console.log(`ℹ️  ${evaluation.category?.toUpperCase()} question → Skipping (no data needed)`);
                                            console.log(`   Reason: ${evaluation.reason}`);
                                        }
                                    }
                                    catch (error) {
                                        console.error('❌ Error in smart context evaluation:', error);
                                    }
                                }
                            }
                            const now = Date.now();
                            const timeSinceLastSuggestion = now - lastSuggestionTime;
                            const transcriptLower = transcript.toLowerCase();
                            const isCriticalObjection = CRITICAL_OBJECTION_PHRASES.some(phrase => transcriptLower.includes(phrase));
                            console.log(`🔍 Check suggestion conditions: confidence=${confidence.toFixed(2)} (min: ${MIN_CONFIDENCE}), bufferLen=${transcriptBuffer.length} (min: ${MIN_BUFFER_LENGTH}), timeSince=${timeSinceLastSuggestion}ms (min: ${SUGGESTION_DEBOUNCE_MS}ms), isCriticalObjection=${isCriticalObjection}`);
                            const normalConditionsMet = confidence >= MIN_CONFIDENCE &&
                                transcriptBuffer.length >= MIN_BUFFER_LENGTH &&
                                timeSinceLastSuggestion > SUGGESTION_DEBOUNCE_MS;
                            const criticalObjectionConditionsMet = confidence >= MIN_CONFIDENCE &&
                                isCriticalObjection &&
                                timeSinceLastSuggestion > SUGGESTION_DEBOUNCE_MS;
                            if (normalConditionsMet || criticalObjectionConditionsMet) {
                                if (criticalObjectionConditionsMet && !normalConditionsMet) {
                                    console.log('🚨 CRITICAL OBJECTION DETECTED - Processing short phrase immediately!');
                                }
                                else {
                                    console.log('✅ Conditions met for HIGH-QUALITY suggestion, generating...');
                                }
                                if (session.userId !== 'demo-user') {
                                    const userStats = userSuggestions.get(session.userId);
                                    const currentTime = Date.now();
                                    if (!userStats || currentTime > userStats.resetTime) {
                                        userSuggestions.set(session.userId, {
                                            count: 0,
                                            resetTime: currentTime + 5 * 60 * 1000
                                        });
                                    }
                                    const stats = userSuggestions.get(session.userId);
                                    if (stats.count >= MAX_SUGGESTIONS_PER_5MIN) {
                                        console.log(`⚠️ User ${session.userId} exceeded suggestion rate limit (${stats.count}/${MAX_SUGGESTIONS_PER_5MIN})`);
                                        ws.send(JSON.stringify({
                                            type: 'rate_limit',
                                            message: 'Rate limit reached. Please wait a few minutes.',
                                            resetTime: stats.resetTime
                                        }));
                                        return;
                                    }
                                    stats.count++;
                                    console.log(`📊 Suggestion ${stats.count}/${MAX_SUGGESTIONS_PER_5MIN} for user ${session.userId}`);
                                }
                                lastSuggestionTime = now;
                                console.log('\n' + '='.repeat(80));
                                console.log('🤖 CHIAMATA GPT - INIZIO');
                                console.log('='.repeat(80));
                                console.log(`📝 Transcript completo (${transcriptBuffer.length} caratteri):`);
                                console.log(`   "${transcriptBuffer}"`);
                                console.log(`📊 Confidence: ${confidence.toFixed(2)}`);
                                console.log(`🌍 Lingua rilevata da Deepgram: ${detectedLanguage}`);
                                console.log(`   ⚠️  GPT verificherà questa lingua analizzando il testo`);
                                console.log('='.repeat(80) + '\n');
                                await (0, gpt_handler_1.handleGPTSuggestion)(transcriptBuffer, ws, detectedLanguage, async (category, suggestion) => {
                                    if (session.userId !== 'demo-user') {
                                        await saveSuggestion(session, category, suggestion, transcriptBuffer.slice(-500), confidence);
                                    }
                                });
                                if (transcriptBuffer.length > 1000) {
                                    transcriptBuffer = transcriptBuffer.slice(-800);
                                }
                            }
                            else {
                                const reasons = [];
                                if (confidence < MIN_CONFIDENCE)
                                    reasons.push(`confidence too low (${confidence.toFixed(2)} < ${MIN_CONFIDENCE})`);
                                if (transcriptBuffer.length < MIN_BUFFER_LENGTH)
                                    reasons.push(`buffer too short (${transcriptBuffer.length} < ${MIN_BUFFER_LENGTH} chars)`);
                                if (timeSinceLastSuggestion <= SUGGESTION_DEBOUNCE_MS)
                                    reasons.push(`cooldown active (${Math.round(timeSinceLastSuggestion / 1000)}s / ${Math.round(SUGGESTION_DEBOUNCE_MS / 1000)}s)`);
                                console.log(`⏸️ Suggestion skipped (waiting for quality): ${reasons.join(', ')}`);
                            }
                        }
                    }
                });
                deepgramConnection.on(sdk_1.LiveTranscriptionEvents.Error, (error) => {
                    console.error('❌ Deepgram error details:');
                    console.error('   - Type:', typeof error);
                    console.error('   - Constructor:', error?.constructor?.name);
                    console.error('   - Message:', error?.message || 'No message');
                    console.error('   - Code:', error?.code);
                    console.error('   - Stack:', error?.stack);
                    console.error('   - Full object:', error);
                    try {
                        ws.send(JSON.stringify({
                            type: 'transcription_error',
                            error: 'Audio transcription service error. Please check your connection and try again.',
                            details: error?.message || 'Unknown error'
                        }));
                    }
                    catch (sendError) {
                        console.error('Failed to notify client of Deepgram error:', sendError);
                    }
                });
                deepgramConnection.on(sdk_1.LiveTranscriptionEvents.Close, (closeEvent) => {
                    console.log('🔌 Deepgram connection closed:', closeEvent);
                    console.log(`   - Had ${audioBuffer.length} buffered packets at close time`);
                    console.log(`   - Total packets sent: ${audioPacketsSent}`);
                    console.log(`   - deepgramReady was: ${deepgramReady}`);
                    deepgramConnection = null;
                    deepgramReady = false;
                    audioBuffer = [];
                });
                deepgramConnection.on(sdk_1.LiveTranscriptionEvents.Metadata, (metadata) => {
                    console.log('📊 Deepgram metadata:', JSON.stringify(metadata, null, 2));
                });
            }
            audioPacketsReceived++;
            if (deepgramConnection) {
                const readyState = deepgramConnection.getReadyState();
                console.log(`🔍 Deepgram state - Ready: ${deepgramReady}, ReadyState: ${readyState}`);
                if (deepgramReady && readyState === 1) {
                    deepgramConnection.send(message);
                    audioPacketsSent++;
                    console.log(`✅ Sending audio packet directly to Deepgram (${message.length} bytes)`);
                    console.log(`📊 Audio Stats - Ricevuti: ${audioPacketsReceived}, Inviati: ${audioPacketsSent}, In Buffer: ${audioBuffer.length}`);
                }
                else {
                    audioBuffer.push(message);
                    console.log(`📦 Buffering audio packet... (${audioBuffer.length} in queue, ready: ${deepgramReady}, state: ${readyState})`);
                    console.log(`📊 Audio Stats - Ricevuti: ${audioPacketsReceived}, Inviati: ${audioPacketsSent}, In Buffer: ${audioBuffer.length}`);
                }
            }
            else {
                console.log('⚠️ No Deepgram connection available to send audio');
                console.log(`📊 Audio Stats - Ricevuti: ${audioPacketsReceived}, Inviati: 0 (no connection)`);
            }
        }
        catch (error) {
            console.error('Error processing message:', error);
        }
    });
    ws.on('close', async () => {
        console.log('👋 WebSocket connection closed');
        if (deadAirTimer) {
            clearInterval(deadAirTimer);
            console.log('🧹 Dead air timer cleared');
        }
        if (currentUserId) {
            const connections = userConnections.get(currentUserId) || 0;
            if (connections > 0) {
                userConnections.set(currentUserId, connections - 1);
                console.log(`📉 User ${currentUserId} connections: ${connections - 1}/${MAX_CONNECTIONS_PER_USER}`);
            }
            if (connections - 1 <= 0) {
                userConnections.delete(currentUserId);
            }
        }
        const session = activeSessions.get(ws);
        if (session && session.userId !== 'demo-user') {
            const duration = (Date.now() - session.startTime.getTime()) / 1000;
            try {
                await supabaseAdmin
                    .from('sales_events')
                    .insert({
                    id: crypto.randomUUID(),
                    user_id: session.userId,
                    session_id: session.sessionId,
                    category: 'system',
                    suggestion: 'Session ended',
                    transcript_context: `Duration: ${duration}s`,
                    confidence: 1,
                    created_at: new Date().toISOString(),
                    metadata: { event: 'session_end', duration_seconds: duration }
                });
            }
            catch (error) {
                console.error('Error logging session end:', error);
            }
        }
        activeSessions.delete(ws);
        if (deepgramConnection) {
            deepgramConnection.finish();
        }
    });
    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});
let isShuttingDown = false;
async function gracefulShutdown(signal) {
    if (isShuttingDown) {
        console.log('⏳ Shutdown already in progress...');
        return;
    }
    isShuttingDown = true;
    console.log(`\n📡 ${signal} received, starting graceful shutdown...`);
    console.log('1️⃣ Stopping new connections...');
    wss.close((err) => {
        if (err)
            console.error('Error closing WebSocket server:', err);
    });
    console.log(`2️⃣ Notifying ${activeSessions.size} active clients...`);
    const closePromises = [];
    activeSessions.forEach((session, ws) => {
        if (ws.readyState === ws_1.WebSocket.OPEN) {
            try {
                ws.send(JSON.stringify({
                    type: 'server_shutdown',
                    message: 'Server is restarting. Please reconnect in a moment.'
                }));
                closePromises.push(new Promise((resolve) => {
                    ws.close(1001, 'Server restarting');
                    setTimeout(resolve, 100);
                }));
            }
            catch (error) {
                console.error('Error notifying client:', error);
            }
        }
    });
    try {
        await Promise.race([
            Promise.all(closePromises),
            new Promise(resolve => setTimeout(resolve, 5000))
        ]);
        console.log('3️⃣ All clients disconnected');
    }
    catch (error) {
        console.error('Error during client disconnection:', error);
    }
    console.log('4️⃣ Closing HTTP server...');
    server.close(() => {
        console.log('✅ Server closed gracefully');
        process.exit(0);
    });
    setTimeout(() => {
        console.error('⚠️ Forced shutdown after timeout');
        process.exit(1);
    }, 10000);
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught Exception:', error);
    gracefulShutdown('UNCAUGHT_EXCEPTION');
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
});
console.log('✅ Graceful shutdown handlers registered');
//# sourceMappingURL=server.js.map