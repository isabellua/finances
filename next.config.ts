import type { NextConfig } from "next";

// Cache Components e partialPrefetching ficam desligados de propósito:
// o app é todo autenticado e dinâmico (dados por usuário), então não há
// ganho em prerender, e desligar evita erros de build em leituras de cookies.
const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // Rotas que mudaram de lugar na reorganização do menu. Mantém links e favoritos antigos.
  async redirects() {
    return [
      { source: "/pagar", destination: "/previsao/pagar", permanent: false },
      { source: "/pagar/calendario.ics", destination: "/previsao/pagar/calendario.ics", permanent: false },
      { source: "/futuro", destination: "/previsao", permanent: false },
      { source: "/faturas", destination: "/previsao/faturas", permanent: false },
      { source: "/calendario", destination: "/previsao/calendario", permanent: false },
      { source: "/anual", destination: "/previsao/anual", permanent: false },
      { source: "/espacos", destination: "/configuracoes", permanent: false },
    ];
  },
};

export default nextConfig;
