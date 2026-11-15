"use client";

import { useState } from "react";
import { BANKS, CASH, OTHER, bankBySlug, type Bank } from "@/lib/banks";
import { ACCOUNT_TYPE_LABEL, type AccountType } from "@/lib/types";
import { BankLogo } from "./bank-logo";
import { Field, inputCls } from "./ui";

const TILES: Bank[] = [...BANKS, CASH, OTHER];

/** Escolha do banco (grade com logo/cor) e, depois, do tipo de conta. */
export function BankPicker({
  defaultSlug,
  defaultType = "checking",
  defaultOther = "",
}: {
  defaultSlug?: string | null;
  defaultType?: AccountType;
  defaultOther?: string;
}) {
  const [slug, setSlug] = useState<string | null>(bankBySlug(defaultSlug)?.slug ?? null);
  const [q, setQ] = useState("");
  const [type, setType] = useState<AccountType>(defaultType);

  const needle = q.trim().toLowerCase();
  const tiles = needle ? TILES.filter((b) => b.name.toLowerCase().includes(needle)) : TILES;
  const isCash = slug === CASH.slug;
  const types = (Object.entries(ACCOUNT_TYPE_LABEL) as [AccountType, string][]).filter(
    ([t]) => (isCash ? t === "cash" : t !== "cash"),
  );
  const effectiveType: AccountType = isCash ? "cash" : type === "cash" ? "checking" : type;

  return (
    <div className="flex flex-col gap-4 sm:col-span-2">
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">1. Banco</span>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar banco…"
          className={inputCls}
        />
        <div role="radiogroup" aria-label="Banco" className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          {tiles.map((b) => (
            <label
              key={b.slug}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-raised p-2 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent-tint"
            >
              <input
                type="radio"
                name="bank"
                value={b.slug}
                checked={slug === b.slug}
                onChange={() => setSlug(b.slug)}
                required
                className="sr-only"
              />
              <BankLogo bank={b} size={32} />
              <span className="min-w-0 flex-1 truncate">{b.name}</span>
            </label>
          ))}
          {tiles.length === 0 && <p className="col-span-full text-sm text-ink-subtle">Nenhum banco com esse nome. Use “Outro banco”.</p>}
        </div>
      </div>

      {slug === OTHER.slug && (
        <Field label="Nome do banco">
          <input name="other_name" defaultValue={defaultOther} maxLength={60} required className={inputCls} />
        </Field>
      )}

      {slug && (
        <Field label="2. Tipo de conta">
          <select
            name="type"
            value={effectiveType}
            onChange={(e) => setType(e.target.value as AccountType)}
            className={inputCls}
          >
            {types.map(([t, l]) => (
              <option key={t} value={t}>{l}</option>
            ))}
          </select>
        </Field>
      )}
    </div>
  );
}
