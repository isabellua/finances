import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";

const items = [
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
