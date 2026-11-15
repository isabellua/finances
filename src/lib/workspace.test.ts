import { describe, expect, it } from "vitest";
import { canEdit, pickWorkspace, safeNext, type Workspace } from "./workspace";

const ws = (id: string, role: Workspace["role"] = "owner"): Workspace => ({
  id, name: id, kind: "personal", role, monthlyCapCents: null, monthlyIncomeGoalCents: null,
});

describe("pickWorkspace", () => {
  it("usa o do cookie quando o usuário é membro", () => {
    expect(pickWorkspace([ws("a"), ws("b")], "b")?.id).toBe("b");
  });
  it("cai no primeiro (mais antigo) se o cookie é de espaço que não é mais dele", () => {
    expect(pickWorkspace([ws("a"), ws("b")], "zzz")?.id).toBe("a");
    expect(pickWorkspace([ws("a")], undefined)?.id).toBe("a");
  });
  it("sem espaços, null", () => {
    expect(pickWorkspace([], "a")).toBeNull();
  });
});

describe("canEdit", () => {
  it("dono e editor editam; leitura e indefinido não", () => {
    expect(canEdit("owner")).toBe(true);
    expect(canEdit("editor")).toBe(true);
    expect(canEdit("viewer")).toBe(false);
    expect(canEdit(undefined)).toBe(false);
  });
});

describe("safeNext", () => {
  it.each([
    ["/convite/abc", "/convite/abc"],
    ["/pagar?x=1", "/pagar?x=1"],
    ["/", "/"],
  ])("aceita %s", (i, e) => expect(safeNext(i)).toBe(e));
  it.each([null, undefined, "", "https://evil.com", "//evil.com", "/\\evil.com", "javascript:alert(1)", "convite"])(
    "rejeita %j",
    (i) => expect(safeNext(i as string | null)).toBe("/"),
  );
});
