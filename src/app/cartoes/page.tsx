import { redirect } from "next/navigation";

// Cartões agora ficam dentro de cada conta.
export default function CartoesRedirect() {
  redirect("/contas");
}
