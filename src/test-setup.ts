// The `jsdom` test environment normally provides window/document/localStorage.
// Some jsdom + Node combinations don't expose `localStorage`, so patch only
// that, and only when missing.
//
// Importantly this must NOT replace `globalThis.window` wholesale: doing so
// desyncs `window` from `document` and breaks anything that renders into the
// live DOM (React Testing Library, focus management, etc.).
import { JSDOM } from 'jsdom';

const g = globalThis as unknown as {
  localStorage?: Storage;
  window?: Window & typeof globalThis;
};

if (!g.localStorage) {
  const dom = new JSDOM('', { url: 'http://localhost/' });
  g.localStorage = dom.window.localStorage;
}

// jsdom does not implement matchMedia; several components query it for
// prefers-reduced-motion.
if (g.window && typeof g.window.matchMedia !== 'function') {
  Object.defineProperty(g.window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}
