/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
// Test config lives here rather than in a separate vitest.config.ts so that
// tests run through the same pipeline as the app (React plugin included),
// which is what makes component tests possible. `defineConfig` is imported
// from vitest/config so the `test` key is typed; it re-exports Vite's own.
export default defineConfig({
    plugins: [react()],
    test: {
        environment: 'jsdom',
        globals: false,
        setupFiles: ['./src/test-setup.ts'],
    },
});
