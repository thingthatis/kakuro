import { useState } from 'react';
import { Share2 } from 'lucide-react';
import { useFocusTrap } from '../hooks/useFocusTrap';

interface ShareModalProps {
  url: string;
  onClose: () => void;
}

/**
 * Fallback share UI shown when the browser refuses clipboard access (e.g.
 * insecure context, missing permission). Also serves as a "what's the code?"
 * peek — the link is always available here even when copy-to-clipboard works.
 */
export function ShareModal({ url, onClose }: ShareModalProps) {
  const ref = useFocusTrap<HTMLDivElement>(onClose);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore; user can still select and copy manually
    }
  };

  // Show only the code part (the bit after `#`) to keep the modal compact.
  const code = url.includes('#') ? url.split('#')[1] : url;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        ref={ref}
        className="modal"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-title"
      >
        <button className="modal-close" onClick={onClose} aria-label="Close share dialog">
          ✕
        </button>
        <h2
          id="share-title"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
        >
          <Share2 className="text-indigo-400" />
          Share this puzzle
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          Send this link to a friend — they will get the same board, the same givens, and the
          same difficulty. The puzzle is uniquely solvable, so they'll see the same solution
          you do.
        </p>
        <div className="share-code-box" aria-label="Puzzle share code">
          <code>{code}</code>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginTop: '1rem' }}>
          <button className="btn" onClick={onClose}>
            Close
          </button>
          <button className="btn btn-primary" onClick={copy} autoFocus>
            {copied ? 'Copied!' : 'Copy link'}
          </button>
        </div>
      </div>
    </div>
  );
}
