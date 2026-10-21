import { useEffect, useState } from 'react';

export function OfflineBanner() {
  const [offline, setOffline] = useState(
    typeof navigator !== 'undefined' ? !navigator.onLine : false,
  );

  useEffect(() => {
    const goOffline = () => setOffline(true);
    const goOnline = async () => {
      try {
        const response = await fetch('/api/health', { cache: 'no-store' });
        if (response.ok) setOffline(false);
      } catch {
        setOffline(true);
      }
    };
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  if (!offline) return null;
  return (
    <div
      data-testid="offline-banner"
      role="status"
      className="sticky top-0 z-30 border-b border-line bg-warning-soft px-4 py-1.5 text-center t-meta text-warning"
    >
      You're offline. Changes will sync when you're back.
    </div>
  );
}
