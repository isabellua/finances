/**
 * Traduz o código de erro do Supabase Auth em uma mensagem útil.
 * Antes, todo erro de login virava "E-mail ou senha incorretos" e todo erro de
 * cadastro virava "Não foi possível criar a conta", o que escondia a causa real.
 */
export function signInMessage(code: string | undefined): string {
  switch (code) {
    case "email_not_confirmed":
      return "Seu e-mail ainda não foi confirmado. Use o link do e-mail de confirmação ou peça para confirmarem a conta.";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "Muitas tentativas seguidas. Espere um minuto e tente de novo.";
    case "invalid_credentials":
      return "E-mail ou senha incorretos.";
    default:
      return "Não foi possível entrar agora. Tente de novo em instantes.";
  }
}

export function signUpMessage(code: string | undefined): string {
  switch (code) {
    case "over_email_send_rate_limit":
      return "Limite de envio de e-mails atingido. A conta pode já ter sido criada: espere um minuto e tente entrar.";
    case "over_request_rate_limit":
      return "Muitas tentativas seguidas. Espere um minuto e tente de novo.";
    case "user_already_exists":
    case "email_exists":
      return "Já existe uma conta com esse e-mail. Tente entrar.";
    case "weak_password":
      return "Senha fraca ou já vazada em algum site. Escolha outra.";
    case "signup_disabled":
    case "email_provider_disabled":
      return "Novos cadastros estão desativados.";
    case "validation_failed":
      return "E-mail ou senha em formato inválido.";
    default:
      return "Não foi possível criar a conta. Tente de novo em instantes.";
  }
}
