import { getSupabase } from "./supabase.js";

const ERRORS: Record<string, string> = {
  admin_not_allowed: "Contas de admin não podem ser excluídas por aqui.",
  pending_payment: "Há um Pix pendente. Pague ou espere expirar antes de excluir a conta.",
  active_sanction: "Sua conta tem uma sanção ativa e não pode ser excluída agora.",
  active_bid: "Você tem um lance de telão no ar ou aguardando pagamento. Espere terminar para excluir a conta.",
  credit_debt: "Sua conta tem uma pendência de crédito. Fale com o contato indicado nos Termos.",
  unauthorized: "Entre com sua conta para continuar.",
};

/** LGPD: exclui a conta logada e tudo ligado a ela (RPC `delete_my_account`). */
export async function deleteMyAccount(): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Sem conexão com o Supabase.");
  const { error } = await supabase.rpc("delete_my_account");
  if (error) {
    const known = Object.keys(ERRORS).find((k) => error.message.includes(k));
    throw new Error(known ? ERRORS[known]! : "Não foi possível excluir agora. Tente de novo.");
  }
}
