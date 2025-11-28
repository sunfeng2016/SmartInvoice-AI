import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    // Polyfill process.env for compatibility with some older libraries if needed,
    // though we moved to import.meta.env in our code.
    'process.env': {} 
  }
});