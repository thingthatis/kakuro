// Polyfill localStorage in the test environment. Some jsdom + Node
// combinations don't expose `window.localStorage` automatically.
import { JSDOM } from 'jsdom';

const dom = new JSDOM('', { url: 'http://localhost/' });
const g = globalThis as unknown as {
  localStorage: Storage;
  window: Window;
};

g.window = dom.window as unknown as Window;
g.localStorage = dom.window.localStorage;
