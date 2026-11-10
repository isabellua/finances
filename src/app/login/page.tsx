import { signIn, signUp } from "./actions";

export default async function LoginPage({
  searchParams,
}: PageProps<"/login">) {
  const sp = await searchParams;
  const erro = typeof sp.erro === "string" ? sp.erro : undefined;
  const ok = typeof sp.ok === "string" ? sp.ok : undefined;

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-12">
      <h1 className="text-2xl font-semibold">Finanças</h1>

      {erro && <p role="alert" className="rounded bg-red-100 p-3 text-sm text-red-800">{erro}</p>}
      {ok && <p role="status" className="rounded bg-green-100 p-3 text-sm text-green-800">{ok}</p>}

      <form className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          E-mail
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            className="rounded border border-zinc-300 bg-white p-2 text-base text-black"
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
            className="rounded border border-zinc-300 bg-white p-2 text-base text-black"
          />
        </label>
        <button
          formAction={signIn}
          className="rounded bg-emerald-700 p-2 font-medium text-white"
        >
          Entrar
        </button>
        <button
          formAction={signUp}
          className="rounded border border-zinc-400 p-2 font-medium"
        >
          Criar conta
        </button>
      </form>
    </main>
  );
}
