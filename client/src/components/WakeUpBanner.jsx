import { useEffect, useRef, useState } from 'react';

export default function WakeUpBanner({ state }) {
  const wasWaking = useRef(false);
  const [showReady, setShowReady] = useState(false);

  useEffect(() => {
    if (state === 'waking') wasWaking.current = true;
    if (state === 'up' && wasWaking.current) {
      setShowReady(true);
      const t = setTimeout(() => setShowReady(false), 3500);
      return () => clearTimeout(t);
    }
  }, [state]);

  if (state === 'waking') {
    return (
      <div className="banner banner--wait" role="status" aria-live="polite">
        <span className="spinner" aria-hidden="true" />
        <span>
          <strong>Waking up the AI service…</strong> Free hosting sleeps when idle, so the first scan can take up to a
          minute. You can upload your photo now and it will wait.
        </span>
      </div>
    );
  }
  if (showReady) return <div className="banner banner--ok" role="status">✅ AI service is ready.</div>;
  return null;
}
