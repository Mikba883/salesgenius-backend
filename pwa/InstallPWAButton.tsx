// InstallPWAButton.tsx
// Componente da mettere nella dashboard di Lovable

import { useState, useEffect } from 'react';

const PWA_URL = 'https://app.tuosito.com'; // Cambia con il tuo URL PWA

export default function InstallPWAButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);

  useEffect(() => {
    // Check if already installed/running as PWA
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
      return;
    }

    // Listen for install prompt
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    // Check if already installed (another way)
    window.addEventListener('appinstalled', () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      // Trigger native install prompt
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      
      if (outcome === 'accepted') {
        console.log('User accepted PWA install');
        setIsInstalled(true);
      }
      
      setDeferredPrompt(null);
    } else {
      // No native prompt available, show instructions or open PWA
      // For iOS or if prompt already dismissed
      setShowInstructions(true);
    }
  };

  const handleLaunchPWA = () => {
    // Open PWA in new window
    const pwaWindow = window.open(
      PWA_URL,
      'SalesGenius',
      'width=400,height=700,left=100,top=100,toolbar=no,menubar=no,status=no'
    );

    if (!pwaWindow) {
      alert('Popup bloccato! Abilita i popup per questo sito.');
    }
  };

  const handleDirectOpen = () => {
    // Direct link for manual installation
    window.open(PWA_URL, '_blank');
  };

  if (showInstructions) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 max-w-2xl">
        <div className="flex justify-between items-start mb-4">
          <h3 className="text-lg font-bold text-blue-900">
            📲 Come Installare l'App
          </h3>
          <button
            onClick={() => setShowInstructions(false)}
            className="text-blue-600 hover:text-blue-800"
          >
            ✕
          </button>
        </div>

        {/* Chrome/Edge Instructions */}
        <div className="mb-4">
          <h4 className="font-semibold text-blue-900 mb-2">
            💻 Chrome / Edge (Desktop)
          </h4>
          <ol className="list-decimal list-inside space-y-1 text-sm text-blue-800">
            <li>
              <a 
                href={PWA_URL} 
                target="_blank" 
                rel="noopener noreferrer"
                className="underline hover:text-blue-600"
              >
                Apri l'app in una nuova scheda
              </a>
            </li>
            <li>Clicca l'icona ⊕ nella barra degli indirizzi (in alto a destra)</li>
            <li>Seleziona "Installa SalesGenius"</li>
            <li>L'app apparirà sul desktop!</li>
          </ol>
        </div>

        {/* Safari/iOS Instructions */}
        <div className="mb-4">
          <h4 className="font-semibold text-blue-900 mb-2">
            📱 Safari (iPhone/iPad)
          </h4>
          <ol className="list-decimal list-inside space-y-1 text-sm text-blue-800">
            <li>
              <a 
                href={PWA_URL} 
                target="_blank" 
                rel="noopener noreferrer"
                className="underline hover:text-blue-600"
              >
                Apri l'app in Safari
              </a>
            </li>
            <li>Tocca il pulsante Condividi (quadrato con freccia)</li>
            <li>Scorri e tocca "Aggiungi a Home"</li>
            <li>Tocca "Aggiungi"</li>
            <li>L'icona apparirà nella home!</li>
          </ol>
        </div>

        <button
          onClick={handleDirectOpen}
          className="w-full py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition"
        >
          Apri App per Installare
        </button>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-xl p-6 shadow-lg max-w-2xl">
      <div className="flex items-start gap-4">
        {/* Icon */}
        <div className="text-5xl flex-shrink-0">🎯</div>
        
        {/* Content */}
        <div className="flex-1">
          <h3 className="text-xl font-bold mb-2">
            AI Sales Assistant
          </h3>
          <p className="text-blue-100 text-sm mb-4">
            {isInstalled 
              ? 'App installata! Aprila quando hai una chiamata per ricevere suggerimenti in tempo reale.'
              : 'Installa l\'app desktop per avere i suggerimenti AI sempre a portata di mano durante le chiamate.'
            }
          </p>

          {/* Action Buttons */}
          <div className="flex gap-3">
            {!isInstalled ? (
              <>
                <button
                  onClick={handleInstallClick}
                  className="px-6 py-3 bg-white text-blue-600 rounded-lg font-semibold hover:bg-blue-50 transition shadow-md"
                >
                  📲 Installa App
                </button>
                <button
                  onClick={handleLaunchPWA}
                  className="px-4 py-3 bg-blue-700 text-white rounded-lg font-semibold hover:bg-blue-800 transition"
                >
                  Apri Senza Installare
                </button>
              </>
            ) : (
              <button
                onClick={handleLaunchPWA}
                className="px-6 py-3 bg-white text-blue-600 rounded-lg font-semibold hover:bg-blue-50 transition shadow-md"
              >
                🚀 Apri Assistant
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tips */}
      <div className="mt-4 pt-4 border-t border-blue-400">
        <div className="flex items-start gap-2 text-xs text-blue-100">
          <span>💡</span>
          <div>
            <strong>Tip:</strong> Dopo l'installazione, troverai l'icona sul desktop.
            Durante le chiamate, apri l'app e posizionala sopra la finestra della riunione
            per vedere i suggerimenti in tempo reale!
          </div>
        </div>
      </div>
    </div>
  );
}
