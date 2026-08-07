import { useCallback, useRef } from 'react';

type SoundType = 'select' | 'input' | 'clear' | 'error' | 'win' | 'hint';

/**
 * Lazily creates a single AudioContext on first sound play and reuses it
 * for all subsequent calls. Browsers warn about creating a new AudioContext
 * on every interaction.
 */
export function useAudio(enabled: boolean) {
  const ctxRef = useRef<AudioContext | null>(null);

  const ensureContext = useCallback((): AudioContext | null => {
    if (typeof window === 'undefined') return null;
    if (ctxRef.current) return ctxRef.current;
    const AudioContextClass =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return null;
    try {
      ctxRef.current = new AudioContextClass();
    } catch {
      return null;
    }
    return ctxRef.current;
  }, []);

  const playSound = useCallback(
    (type: SoundType) => {
      if (!enabled) return;
      const ctx = ensureContext();
      if (!ctx) return;
      try {
        const playTone = (
          freq: number,
          duration: number,
          type: OscillatorType,
          startOffset = 0,
          peak = 0.08
        ) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.type = type;
          const t = ctx.currentTime + startOffset;
          osc.frequency.setValueAtTime(freq, t);
          gain.gain.setValueAtTime(peak, t);
          gain.gain.linearRampToValueAtTime(0, t + duration);
          osc.start(t);
          osc.stop(t + duration);
        };

        switch (type) {
          case 'select':
            playTone(300, 0.05, 'sine', 0, 0.05);
            break;
          case 'input':
            playTone(440, 0.1, 'triangle', 0, 0.08);
            break;
          case 'clear':
            playTone(200, 0.15, 'sawtooth', 0, 0.05);
            break;
          case 'error':
            playTone(150, 0.25, 'sawtooth', 0, 0.1);
            break;
          case 'hint':
            playTone(523.25, 0.4, 'sine', 0, 0.06);
            playTone(659.25, 0.3, 'sine', 0.1, 0.06);
            playTone(783.99, 0.2, 'sine', 0.2, 0.06);
            break;
          case 'win': {
            // C major arpeggio
            const freqs = [261.63, 329.63, 392.0, 523.25, 659.25];
            for (let i = 0; i < freqs.length; i++) {
              playTone(freqs[i], 1.2, 'sine', i * 0.08, 0.08);
            }
            break;
          }
        }
      } catch (e) {
        console.warn('Audio playback failed:', e);
      }
    },
    [enabled, ensureContext]
  );

  return playSound;
}
