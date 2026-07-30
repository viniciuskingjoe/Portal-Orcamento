import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Sem este arquivo o @vitejs/plugin-react nunca era carregado: o build passava
// (o esbuild do Vite já usa o JSX automático), mas não havia Fast Refresh — e
// como o estado do orçamento vive todo em memória, cada edição de código
// recarregava a página e apagava o trabalho em andamento.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: true,
    // O front chama /api/* e o proxy encaminha para o backend (npm run api).
    // Evita CORS e mantém a mesma origem em dev e em produção.
    proxy: {
      "/api": {
        target: `http://localhost:${process.env.API_PORT ?? 3000}`,
        changeOrigin: true,
      },
    },
  },
});
