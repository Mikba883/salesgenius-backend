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
(0, dotenv_1.config)();
const supabaseAuth = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const supabaseAdmin = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const activeSessions = new Map();
const deepgramClient = (0, sdk_1.createClient)(process.env.DEEPGRAM_API_KEY);
const app = (0, express_1.default)();
app.use(express_1.default.json());
const PORT = process.env.PORT || 8080;
console.log('🚀 Server starting with DEBUG LOGGING ENABLED - Version 2.4.2');
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
        version: '2.4.1',
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
        version: '2.4.1',
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
    console.log(`🚀 SalesGenius Backend v2.4.2-DEBUG running on port ${PORT}`);
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
    let transcriptBuffer = '';
    let lastSuggestionTime = 0;
    const SUGGESTION_DEBOUNCE_MS = 3000;
    let currentUserId = null;
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
                deepgramConnection = deepgramClient.listen.live({
                    encoding: 'linear16',
                    sample_rate: 16000,
                    channels: 1,
                    language: 'it',
                    punctuate: true,
                    smart_format: true,
                    model: 'nova-2',
                    interim_results: true,
                    utterance_end_ms: 2000,
                    vad_events: true,
                });
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
                    const transcript = data.channel?.alternatives[0]?.transcript;
                    const isFinal = data.is_final;
                    const confidence = data.channel?.alternatives[0]?.confidence || 0;
                    if (transcript && transcript.length > 0) {
                        console.log(`📝 [${isFinal ? 'FINAL' : 'INTERIM'}] ${transcript} (confidence: ${confidence})`);
                        if (isFinal) {
                            transcriptBuffer += ' ' + transcript;
                            console.log(`📊 Buffer length: ${transcriptBuffer.length} chars`);
                            const now = Date.now();
                            if (confidence >= 0.6 &&
                                transcriptBuffer.length > 20 &&
                                (now - lastSuggestionTime) > SUGGESTION_DEBOUNCE_MS) {
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
                                await (0, gpt_handler_1.handleGPTSuggestion)(transcriptBuffer, ws, async (category, suggestion) => {
                                    if (session.userId !== 'demo-user') {
                                        await saveSuggestion(session, category, suggestion, transcriptBuffer.slice(-500), confidence);
                                    }
                                });
                                if (transcriptBuffer.length > 1000) {
                                    transcriptBuffer = transcriptBuffer.slice(-800);
                                }
                            }
                        }
                    }
                });
                deepgramConnection.on(sdk_1.LiveTranscriptionEvents.Error, (error) => {
                    console.error('❌ Deepgram error:', JSON.stringify(error, null, 2));
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
                    console.log('📊 Deepgram metadata:', metadata);
                });
            }
            if (deepgramConnection) {
                const readyState = deepgramConnection.getReadyState();
                console.log(`🔍 Deepgram state - Ready: ${deepgramReady}, ReadyState: ${readyState}`);
                if (deepgramReady && readyState === 1) {
                    deepgramConnection.send(message);
                    audioPacketsSent++;
                    console.log(`✅ Sending audio packet directly to Deepgram (${message.length} bytes) - Total sent: ${audioPacketsSent}`);
                }
                else {
                    audioBuffer.push(message);
                    console.log(`📦 Buffering audio packet... (${audioBuffer.length} in queue, ready: ${deepgramReady}, state: ${readyState})`);
                }
            }
            else {
                console.log('⚠️ No Deepgram connection available to send audio');
            }
        }
        catch (error) {
            console.error('Error processing message:', error);
        }
    });
    ws.on('close', async () => {
        console.log('👋 WebSocket connection closed');
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