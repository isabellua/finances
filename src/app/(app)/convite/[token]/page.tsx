import { z } from "zod";
import { notFound } from "next/navigation";
import { Card, PageHeader, btnPrimary } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { acceptInvite } from "../../espacos/actions";

export default async function ConvitePage({ params }: PageProps<"/convite/[token]">) {
  const { token } = await params;
  if (!z.uuid().safeParse(token).success) notFound();
  await requireUser();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Convite para um espaço" />
      <Card className="flex flex-col gap-3">
        <p className="text-sm">
          Você recebeu um convite para participar de um espaço de finanças. Ao aceitar, você passa a ver e (conforme o acesso dado) editar os dados dele. Seus outros espaços continuam separados.
        </p>
        <form action={acceptInvite}>
          <input type="hidden" name="token" value={token} />
          <button className={btnPrimary}>Aceitar e entrar no espaço</button>
        </form>
      </Card>
    </div>
  );
}
