import { useEffect, useRef } from 'react';

export default function App() {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const focusIframe = () => {
      try {
        iframeRef.current?.contentWindow?.focus();
      } catch {
        // ignore
      }
    };

    focusIframe();
    const timer = setTimeout(focusIframe, 200);

    // Forward keyboard events (Space, ArrowUp, Enter) to iframe in case parent document receives the keydown event
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'Enter') {
        try {
          const iframeWindow = iframeRef.current?.contentWindow;
          if (iframeWindow && document.activeElement !== iframeRef.current) {
            e.preventDefault();
            iframeWindow.dispatchEvent(
              new KeyboardEvent('keydown', {
                code: e.code,
                key: e.key,
                keyCode: e.keyCode,
                which: e.which,
                bubbles: true,
                cancelable: true,
              })
            );
          }
        } catch {
          // ignore
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <main className="w-full h-full overflow-hidden bg-[#050b1f] flex items-center justify-center m-0 p-0">
      <iframe
        ref={iframeRef}
        src="/assets/aistudio/Robo_Cat_Flap_5b9270e9.html"
        title="Robo Cat Flap"
        className="w-full h-full border-0 block"
        allow="autoplay"
      />
    </main>
  );
}
