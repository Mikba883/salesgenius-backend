#!/usr/bin/env node

/**
 * Test client per verificare il backend SalesGenius
 * Usage: node test-client.js [ws://localhost:8080]
 */

import WebSocket from 'ws';
import { readFileSync } from 'fs';

const WS_URL = process.argv[2] || 'ws://localhost:8080';

console.log('🧪 SalesGenius Test Client');
console.log('📡 Connecting to:', WS_URL);

const ws = new WebSocket(WS_URL);

ws.on('open', () => {
  console.log('✅ Connected!');

  // Send hello
  ws.send(JSON.stringify({
    op: 'hello',
    app: 'test-client',
    version: '0.1',
  }));

  console.log('📤 Sent hello message');

  // Simulate sending audio frames
  console.log('🎤 Simulating audio stream...');

  // Create dummy PCM16 data (silence)
  const SAMPLE_RATE = 16000;
  const FRAME_SIZE = 640; // ~40ms at 16kHz
  const DURATION_SEC = 5;
  const NUM_FRAMES = Math.floor((SAMPLE_RATE / FRAME_SIZE) * DURATION_SEC);

  let frameCount = 0;

  const interval = setInterval(() => {
    if (frameCount >= NUM_FRAMES) {
      console.log('✅ Finished sending test frames');
      clearInterval(interval);
      setTimeout(() => {
        console.log('🔌 Closing connection...');
        ws.close();
      }, 2000);
      return;
    }

    // Send header
    ws.send(JSON.stringify({
      op: 'audio',
      seq: frameCount,
      sr: SAMPLE_RATE,
      ch: 1,
      samples: FRAME_SIZE,
    }));

    // Send dummy audio data (silence)
    const pcm = new Int16Array(FRAME_SIZE);
    ws.send(Buffer.from(pcm.buffer));

    frameCount++;

    if (frameCount % 25 === 0) {
      console.log(`📊 Sent ${frameCount}/${NUM_FRAMES} frames`);
    }

  }, 40); // Send frame every 40ms
});

ws.on('message', (data) => {
  try {
    const msg = JSON.parse(data.toString());
    console.log('📨 Received:', msg);

    if (msg.type === 'suggestion.start') {
      console.log(`🎯 New suggestion (${msg.category}): ID=${msg.id}`);
    } else if (msg.type === 'suggestion.delta') {
      process.stdout.write(msg.textChunk);
    } else if (msg.type === 'suggestion.end') {
      console.log(`\n✅ Suggestion ${msg.id} completed`);
    }
  } catch (e) {
    console.log('📨 Received binary data:', data.length, 'bytes');
  }
});

ws.on('close', () => {
  console.log('🔌 Connection closed');
  process.exit(0);
});

ws.on('error', (err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});

// Handle Ctrl+C
process.on('SIGINT', () => {
  console.log('\n🛑 Interrupted');
  ws.close();
  process.exit(0);
});
