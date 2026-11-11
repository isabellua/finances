export type AccountType = "checking" | "savings" | "investment" | "cash";
export type TransactionKind =
  | "income"
  | "expense"
  | "transfer"
  | "invoice_payment";

export type Account = {
  id: string;
  name: string;
  institution: string | null;
  type: AccountType;
  opening_balance_cents: number;
  archived: boolean;
};

export type CreditCard = {
  id: string;
  account_id: string;
  name: string;
  brand: string | null;
  credit_limit_cents: number | null;
  closing_day: number;
  due_day: number;
  last4: string | null;
  archived: boolean;
  fx_spread_bps?: number | null;
  fx_iof_bps?: number | null;
  fx_rate_rule?: "purchase_date" | "closing_date" | "due_date";
};

export type Category = {
  id: string;
  name: string;
};

export type Transaction = {
  id: string;
  kind: TransactionKind;
  amount_cents: number;
  occurred_on: string;
  description: string;
  category_id: string | null;
  account_id: string | null;
  card_id: string | null;
  transfer_account_id: string | null;
  fx_currency?: string | null;
  fx_amount_minor?: number | null;
  fx_rate_micro?: number | null;
  fx_spread_bps?: number | null;
  fx_iof_bps?: number | null;
  fx_estimated_cents?: number | null;
  fx_estimated?: boolean;
};

export type AccountBalance = { account_id: string; balance_cents: number };

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  checking: "Conta corrente",
  savings: "Poupança",
  investment: "Investimento",
  cash: "Dinheiro",
};

export const KIND_LABEL: Record<TransactionKind, string> = {
  income: "Entrada",
  expense: "Saída",
  transfer: "Transferência",
  invoice_payment: "Pagamento de fatura",
};
