import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import type { Rule } from "@/lib/import/merchant";
import type { Account, Category, CreditCard } from "@/lib/types";
import { ImportWizard } from "./import-wizard";

export default async function ImportarPage() {
  const { supabase } = await requireUser();

  const [{ data: accounts }, { data: cards }, { data: cats }, { data: rules }] = await Promise.all([
    supabase
      .from("accounts")
      .select("id,name,institution,type,opening_balance_cents,archived")
      .eq("archived", false)
      .order("created_at")
      .overrideTypes<Account[]>(),
    supabase
      .from("credit_cards")
      .select("id,account_id,name,brand,credit_limit_cents,closing_day,due_day,last4,archived")
      .eq("archived", false)
      .order("created_at")
      .overrideTypes<CreditCard[]>(),
    supabase.from("categories").select("id,name").order("name").overrideTypes<Category[]>(),
    supabase.from("category_rules").select("pattern,category_id").overrideTypes<Rule[]>(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Importar extrato ou fatura"
        subtitle="Arquivos OFX ou CSV baixados do app ou do internet banking. O arquivo é lido no seu navegador; só as linhas que você confirmar são enviadas."
      />
      <ImportWizard
        targets={[
          ...(accounts ?? []).map((a) => ({ key: `a:${a.id}`, label: `Conta · ${a.name}`, isCard: false })),
          ...(cards ?? []).map((c) => ({
            key: `c:${c.id}`,
            label: `Cartão · ${c.last4 ? `${c.name} •••• ${c.last4}` : c.name}`,
            isCard: true,
          })),
        ]}
        categories={cats ?? []}
        rules={rules ?? []}
      />
    </div>
  );
}
