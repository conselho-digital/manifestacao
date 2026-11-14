import { defineConfig } from 'vite';

// Três páginas: o jogo (index.html), o editor de armas nas mãos (armas.html) e a ferramenta de criar personagens (personagens.html); os dois editores abrem também por abas da página de animações.
export default defineConfig({
  build: {
    rollupOptions: { input: { main: 'index.html', armas: 'armas.html', personagens: 'personagens.html' } },
  },
});
