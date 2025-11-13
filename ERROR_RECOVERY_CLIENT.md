# 🔄 ERROR RECOVERY - AUTO-RECONNECT (Extension Chrome)

## Codice da implementare nell'Extension

```typescript
// WebSocket Manager con Auto-Reconnect
class WebSocketManager {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000; // Start at 1 second
  private maxReconnectDelay = 30000; // Max 30 seconds
  private isIntentionallyClosed = false;

  connect(url: string, token: string) {
    this.isIntentionallyClosed = false;

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        console.log('✅ WebSocket connected');
        this.reconnectAttempts = 0;
        this.reconnectDelay = 1000; // Reset delay

        // Hide reconnection UI
        this.hideReconnectingToast();

        // Send hello message
        this.ws!.send(JSON.stringify({
          op: 'hello',
          token: token
        }));
      };

      this.ws.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === 'capture_ready') {
          // Start audio capture
          this.startAudioCapture();
        } else if (data.type === 'rate_limit') {
          // Show rate limit warning
          this.showRateLimitWarning(data.message, data.resetTime);
        } else if (data.type === 'server_shutdown') {
          // Server is restarting
          this.showToast('Server is restarting. Reconnecting...', 'warning');
        }
        // ... other message handlers
      };

      this.ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
      };

      this.ws.onclose = (event) => {
        console.log('🔌 WebSocket closed:', event.code, event.reason);

        // Clear active states
        this.stopAudioCapture();

        // Don't reconnect if intentionally closed
        if (this.isIntentionallyClosed) {
          console.log('Connection intentionally closed, not reconnecting');
          return;
        }

        // Auto-reconnect
        this.handleReconnect(url, token);
      };

    } catch (error) {
      console.error('Failed to create WebSocket:', error);
      this.handleReconnect(url, token);
    }
  }

  private handleReconnect(url: string, token: string) {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.showToast(
        'Unable to connect to server. Please check your connection and try again.',
        'error'
      );
      return;
    }

    this.reconnectAttempts++;

    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, max 30s
    const delay = Math.min(
      this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
      this.maxReconnectDelay
    );

    console.log(`🔄 Reconnecting in ${delay/1000}s (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);

    this.showReconnectingToast(
      `Connection lost. Reconnecting in ${delay/1000}s...`,
      this.reconnectAttempts,
      this.maxReconnectAttempts
    );

    setTimeout(() => {
      this.connect(url, token);
    }, delay);
  }

  disconnect() {
    this.isIntentionallyClosed = true;
    if (this.ws) {
      this.ws.close(1000, 'User disconnected');
      this.ws = null;
    }
  }

  send(data: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    } else {
      console.warn('WebSocket not connected, message not sent');
    }
  }

  // UI Helper Methods
  private showReconnectingToast(message: string, current: number, max: number) {
    // Show a toast notification
    chrome.runtime.sendMessage({
      type: 'show_toast',
      message: message,
      severity: 'warning',
      progress: (current / max) * 100
    });
  }

  private hideReconnectingToast() {
    chrome.runtime.sendMessage({
      type: 'hide_toast'
    });
  }

  private showToast(message: string, severity: 'info' | 'warning' | 'error') {
    chrome.runtime.sendMessage({
      type: 'show_toast',
      message: message,
      severity: severity
    });
  }

  private showRateLimitWarning(message: string, resetTime: number) {
    const timeLeft = Math.ceil((resetTime - Date.now()) / 60000); // minutes
    this.showToast(
      `${message} Time remaining: ${timeLeft} minute${timeLeft !== 1 ? 's' : ''}`,
      'warning'
    );
  }

  private startAudioCapture() {
    // Your existing audio capture code
    console.log('🎤 Starting audio capture...');
  }

  private stopAudioCapture() {
    // Your existing stop audio code
    console.log('🛑 Stopping audio capture...');
  }
}

// Usage Example
const wsManager = new WebSocketManager();
wsManager.connect('wss://salesgenius-backend.onrender.com/stream-audio', userToken);

// When user clicks disconnect
// wsManager.disconnect();
```

## 🎨 Toast UI Component (Optional - React Example)

```typescript
// Toast.tsx
import React, { useEffect, useState } from 'react';

interface ToastProps {
  message: string;
  severity: 'info' | 'warning' | 'error';
  progress?: number;
  onClose: () => void;
}

export const Toast: React.FC<ToastProps> = ({ message, severity, progress, onClose }) => {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    // Auto-hide after 5 seconds for non-warning toasts
    if (severity !== 'warning') {
      const timer = setTimeout(() => {
        setVisible(false);
        onClose();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [severity, onClose]);

  const bgColor = {
    info: '#3b82f6',
    warning: '#f59e0b',
    error: '#ef4444'
  }[severity];

  if (!visible) return null;

  return (
    <div style={{
      position: 'fixed',
      top: '20px',
      right: '20px',
      background: bgColor,
      color: 'white',
      padding: '16px 24px',
      borderRadius: '8px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      zIndex: 10000,
      minWidth: '300px',
      maxWidth: '400px'
    }}>
      <div>{message}</div>
      {progress !== undefined && (
        <div style={{
          marginTop: '8px',
          height: '4px',
          background: 'rgba(255,255,255,0.3)',
          borderRadius: '2px',
          overflow: 'hidden'
        }}>
          <div style={{
            height: '100%',
            background: 'white',
            width: `${progress}%`,
            transition: 'width 0.3s ease'
          }} />
        </div>
      )}
    </div>
  );
};
```

## ✅ Testing Checklist

1. **Test Reconnect**:
   - Disconnect WiFi → Wait → Reconnect WiFi
   - Extension should auto-reconnect

2. **Test Rate Limiting**:
   - Generate 10+ suggestions quickly
   - Should see rate limit warning

3. **Test Max Connections**:
   - Open 3+ tabs with extension
   - 3rd tab should be blocked

4. **Test Server Restart**:
   - Deploy new version on Render
   - Extension should reconnect automatically

## 🚀 Benefits

- ✅ **Better UX**: Users don't need to refresh
- ✅ **Resilience**: Handles network issues gracefully
- ✅ **Clear Feedback**: Users know what's happening
- ✅ **Production Ready**: Handles all edge cases
