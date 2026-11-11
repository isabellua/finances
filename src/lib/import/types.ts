/** Linha normalizada vinda de qualquer arquivo. Valor com sinal: negativo = saída. */
export type ParsedRow = {
  date: string; // YYYY-MM-DD
  description: string;
  amountCents: number; // com sinal
};

export type ParseResult = {
  rows: ParsedRow[];
  warnings: string[];
};
