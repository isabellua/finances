import { btnGhost, btnPrimary, inputCls } from "@/components/ui";
import { signIn, signUp } from "./actions";

export default async function LoginPage({
  searchParams,
}: PageProps<"/login">) {
  const sp = await searchParams;
  const erro = typeof sp.erro === "string" ? sp.erro : undefined;
  const ok = typeof sp.ok === "string" ? sp.ok : undefined;

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-12">
      <h1 className="text-[28px] leading-8 font-[650] tracking-[-0.6px]">Finanças</h1>

      {erro && <p role="alert" className="rounded-md bg-neg-tint p-3 text-sm text-neg">{erro}</p>}
      {ok && <p role="status" className="rounded-md bg-pos-tint p-3 text-sm text-pos">{ok}</p>}

      <form className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          E-mail
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Senha
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            minLength={8}
            required
            className={inputCls}
          />
        </label>
        <button
          formAction={signIn}
          className={btnPrimary}
        >
          Entrar
        </button>
        <button
          formAction={signUp}
          className={`${btnGhost} py-2.5 text-base`}
        >
          Criar conta
        </button>
      </form>
    </main>
  );
}
