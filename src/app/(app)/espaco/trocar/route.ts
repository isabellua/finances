import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { WS_COOKIE, safeNext } from "@/lib/workspace";

/**
 * Troca o espaço ativo: confere se o usuário é membro, grava o cookie e redireciona.
 * Rota simples (não ação de servidor) de propósito: a navegação completa que segue o
 * redirecionamento já carrega a página com o novo espaço, sem depender de cache do roteador.
 */
async function handle(request: NextRequest, id: string | null, next: string | null) {
  const { workspaces } = await requireUser();
  const parsed = z.uuid().safeParse(id);
  const target = parsed.success ? workspaces.find((w) => w.id === parsed.data) : undefined;
  if (!target) {
    return NextResponse.redirect(new URL("/?erro=" + encodeURIComponent("Espaço inválido."), request.url), 303);
  }

  const res = NextResponse.redirect(new URL(safeNext(next), request.url), 303);
  res.cookies.set(WS_COOKIE, target.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}

export async function POST(request: NextRequest) {
  const form = await request.formData();
  return handle(request, String(form.get("id") ?? ""), String(form.get("next") ?? "/"));
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  return handle(request, sp.get("id"), sp.get("next"));
}
