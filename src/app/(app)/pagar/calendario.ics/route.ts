import { requireUser } from "@/lib/auth";
import { KIND_LABELS } from "@/lib/commitments";
import { todayISO } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import { buildICS } from "@/lib/ics";
import { loadPayables } from "@/lib/payables";

export async function GET() {
  const { supabase } = await requireUser();
  const today = todayISO();
  const { rows } = await loadPayables(supabase, today, 90);

  // Só o que ainda falta: não pago, não pulado e não reconhecido no extrato; de hoje em diante.
  const events = rows
    .filter((r) => ["due_soon", "upcoming"].includes(r.status))
    .map((r) => {
      const c = r.commitment;
      const part = c.total_occurrences && c.total_occurrences > 1 ? ` (${r.seq}/${c.total_occurrences})` : "";
      return {
        uid: `${c.id}-${r.seq}@financas`,
        date: r.date,
        summary: `${c.description}${part} · ${formatBRL(c.amount_cents)}`,
        description: KIND_LABELS[c.kind],
      };
    });

  return new Response(buildICS(events), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="vencimentos.ics"',
      "Cache-Control": "no-store",
    },
  });
}
