import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";

const items = [
  { href: "/faturas", title: "Faturas", text: "Fatura de cada cartão por ciclo de fechamento: total, pago, limite usado e tendência." },
  { href: "/calendario", title: "Calendário", text: "Dias com lançamentos e vencimentos; veja o que entrou, saiu e o que está previsto." },
  { href: "/futuro", title: "Próximos meses", text: "Quanto já está comprometido, quanto sobra do teto e quando as parcelas terminam." },
  { href: "/anual", title: "Visão anual", text: "Receitas e despesas mês a mês e por categoria no ano." },
  { href: "/saude", title: "Saúde financeira", text: "Indicador de 0 a 100 com poupança, reserva, crédito e comprometimento." },
  { href: "/espacos", title: "Espaços", text: "Separe finanças pessoais, do trabalho, da família ou de amigos, e convide pessoas." },
  { href: "/cambio", title: "Compra internacional", text: "Calcule o custo de uma compra em moeda estrangeira no cartão: cotação, spread e IOF." },
  { href: "/categorias", title: "Categorias", text: "Crie e remova as categorias dos lançamentos." },
];

export default function MaisPage() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Mais" />
      <ul className="flex flex-col gap-3">
        {items.map((i) => (
          <li key={i.href}>
            <Link href={i.href}>
              <Card className="flex flex-col gap-1 hover:bg-sunken">
                <p className="font-semibold">{i.title}</p>
                <p className="text-sm text-ink-subtle">{i.text}</p>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
