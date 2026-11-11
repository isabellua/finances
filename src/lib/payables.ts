import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  classify,
  occurrencesBetween,
  softMatch,
  type Commitment,
  type OccStatus,
  type Occurrence,
  type Settlement,
} from "./commitments";
import { addDays } from "./dates";

export type PayableRow = Occurrence & {
  status: OccStatus;
  daysUntil: number;
  matchedTxId: string | null;
};

export type Payables = {
  commitments: Commitment[];
  settlements: Settlement[];
  rows: PayableRow[];
};

const COMMITMENT_COLS =
  "id,kind,description,amount_cents,frequency,start_on,total_occurrences,end_on,account_id,card_id,category_id,active";

/**
 * Carrega compromissos e quitações e calcula o status de cada ocorrência até
 * `today + horizonDays`. Inclui tudo o que já passou (para achar as atrasadas).
 */
export async function loadPayables(
  supabase: SupabaseClient,
  today: string,
  horizonDays = 90,
): Promise<Payables> {
  const since = addDays(today, -120);
  const [{ data: commitments }, { data: settlements }, { data: txs }] = await Promise.all([
    supabase.from("commitments").select(COMMITMENT_COLS).order("created_at").overrideTypes<Commitment[]>(),
    supabase
      .from("commitment_settlements")
      .select("commitment_id,seq,status,settled_on,transaction_id")
      .overrideTypes<Settlement[]>(),
    supabase
      .from("transactions")
      .select("id,kind,amount_cents,occurred_on,description,account_id,card_id")
      .eq("kind", "expense")
      .gte("occurred_on", since)
      .overrideTypes<
        {
          id: string;
          kind: string;
          amount_cents: number;
          occurred_on: string;
          description: string;
          account_id: string | null;
          card_id: string | null;
        }[]
      >(),
  ]);

  const cs = commitments ?? [];
  const ss = settlements ?? [];
  const settledBy = new Map(ss.map((s) => [`${s.commitment_id}|${s.seq}`, s]));
  const horizon = addDays(today, horizonDays);

  const all = cs.flatMap((c) => occurrencesBetween(c, "0000-01-01", horizon));
  const pending = all.filter((o) => !settledBy.has(`${o.commitment.id}|${o.seq}`));
  const matches = softMatch(pending, txs ?? []);

  const rows: PayableRow[] = all.map((o) => {
    const key = `${o.commitment.id}|${o.seq}`;
    const settlement = settledBy.get(key);
    const matchedTxId = matches.get(key) ?? null;
    const { status, daysUntil } = classify(o.date, today, settlement, matchedTxId !== null);
    return { ...o, status, daysUntil, matchedTxId };
  });

  return { commitments: cs, settlements: ss, rows };
}
