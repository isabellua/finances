import { redirect } from "next/navigation";

/** Redireciona para `path` com uma mensagem de erro/sucesso na query string. */
export function back(path: string, kind: "erro" | "ok", message: string): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}${kind}=${encodeURIComponent(message)}`);
}
