import { defineConfig } from 'vite';

// Duas páginas: o jogo (index.html) e o editor de armas nas mãos (armas.html, aberto também pela aba "Armas nas mãos" da página de animações).
export default defineConfig({
  build: {
    rollupOptions: { input: { main: 'index.html', armas: 'armas.html' } },
  },
});
