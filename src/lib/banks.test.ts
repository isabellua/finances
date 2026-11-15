import { describe, expect, it } from "vitest";
import { BANKS, bankBySlug, bankFromName, bankOf, initials, OTHER } from "./banks";

describe("banks", () => {
  it("slugs únicos e válidos para a constraint do banco", () => {
    const slugs = BANKS.map((b) => b.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of [...slugs, "dinheiro", "outro"]) expect(s).toMatch(/^[a-z0-9-]{2,30}$/);
  });
  it("cores em hex", () => {
    for (const b of BANKS) {
      expect(b.color).toMatch(/^#[0-9A-F]{6}$/i);
      expect(b.ink).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });
  it("bankBySlug", () => {
    expect(bankBySlug("itau")?.name).toBe("Itaú");
    expect(bankBySlug("xx")).toBeNull();
    expect(bankBySlug(null)).toBeNull();
  });
  it("bankFromName ignora acento e caixa", () => {
    expect(bankFromName("ITAU")?.slug).toBe("itau");
    expect(bankFromName("Itaú 2")?.slug).toBe("itau");
    expect(bankFromName("Banco do Brasil")?.slug).toBe("banco-do-brasil");
    expect(bankFromName("Cooperativa X")).toBeNull();
  });
  it("bankOf prioriza slug, depois nome, depois outro", () => {
    expect(bankOf({ bank_slug: "nubank", institution: "Itaú", name: "x" }).slug).toBe("nubank");
    expect(bankOf({ institution: "Inter", name: "Inter" }).slug).toBe("inter");
    expect(bankOf({ institution: "Zzz", name: "Zzz" })).toBe(OTHER);
  });
  it("initials", () => {
    expect(initials("Nubank")).toBe("NU");
    expect(initials("Banco do Brasil")).toBe("BD");
    expect(initials("")).toBe("?");
  });
});
