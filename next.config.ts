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
};

export default nextConfig;
