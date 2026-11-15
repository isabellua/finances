export type WorkspaceKind = "personal" | "professional" | "family" | "friends" | "other";
export type WorkspaceRole = "owner" | "editor" | "viewer";

export type Workspace = {
  id: string;
  name: string;
  kind: WorkspaceKind;
  role: WorkspaceRole;
  monthlyCapCents: number | null;
  monthlyIncomeGoalCents: number | null;
};

export const WS_COOKIE = "ws";

export const KIND_LABELS: Record<WorkspaceKind, string> = {
  personal: "Pessoal",
  professional: "Profissional",
  family: "Família",
  friends: "Amigos",
  other: "Outro",
};

export const ROLE_LABELS: Record<WorkspaceRole, string> = {
  owner: "Dono",
  editor: "Pode editar",
  viewer: "Somente leitura",
};

/** Escolhe o espaço ativo: o do cookie, se o usuário ainda for membro; senão o mais antigo. */
export function pickWorkspace(list: Workspace[], cookieId: string | undefined): Workspace | null {
  if (list.length === 0) return null;
  return list.find((w) => w.id === cookieId) ?? list[0];
}

export function canEdit(role: WorkspaceRole | undefined): boolean {
  return role === "owner" || role === "editor";
}

/** Caminho interno seguro para redirecionar após o login (evita redirecionamento aberto). */
export function safeNext(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/";
  return value;
}
