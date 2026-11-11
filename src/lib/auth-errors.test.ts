import { describe, expect, it } from "vitest";
import { signInMessage, signUpMessage } from "./auth-errors";

describe("signInMessage", () => {
  it("e-mail não confirmado não vira 'senha incorreta'", () => {
    expect(signInMessage("email_not_confirmed")).toMatch(/não foi confirmado/);
    expect(signInMessage("email_not_confirmed")).not.toMatch(/senha incorretos/);
  });
  it("credenciais erradas e limite de tentativas", () => {
    expect(signInMessage("invalid_credentials")).toBe("E-mail ou senha incorretos.");
    expect(signInMessage("over_request_rate_limit")).toMatch(/Espere um minuto/);
  });
  it("código desconhecido ou ausente cai no genérico, sem culpar a senha", () => {
    expect(signInMessage(undefined)).not.toMatch(/senha/);
    expect(signInMessage("algo_novo")).toMatch(/Tente de novo/);
  });
});

describe("signUpMessage", () => {
  it("limite de e-mail avisa que a conta pode já existir (foi o caso real)", () => {
    expect(signUpMessage("over_email_send_rate_limit")).toMatch(/pode já ter sido criada/);
  });
  it.each(["user_already_exists", "email_exists"])("%s", (c) => {
    expect(signUpMessage(c)).toMatch(/Já existe/);
  });
  it("senha fraca, cadastro desativado e genérico", () => {
    expect(signUpMessage("weak_password")).toMatch(/Senha fraca/);
    expect(signUpMessage("signup_disabled")).toMatch(/desativados/);
    expect(signUpMessage(undefined)).toMatch(/Não foi possível criar/);
  });
});
