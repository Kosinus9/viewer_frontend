import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
    root: 'frontend',
    server: { host: '127.0.0.1', port: 1420, strictPort: true },
    build: {
        outDir: '../dist',
        emptyOutDir: true,
        rollupOptions: {
            input: {
                viewer: resolve('frontend/index.html'),
                pdf_Poc: resolve('frontend/pdf-poc.html')
            }
        }
    }
});
