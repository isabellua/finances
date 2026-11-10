import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Finanças",
    short_name: "Finanças",
    description: "Controle financeiro da família",
    start_url: "/lancamentos",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#047857",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
