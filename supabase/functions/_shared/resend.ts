// Envio de e-mail transacional via Resend (recibos e avisos).
// Segredos: RESEND_API_KEY, RESEND_FROM (ex.: "Manifestação <no-reply@seu-dominio>").
// O e-mail NÃO é usado para login (login é só Google) — apenas transacional.

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const RESEND_FROM = Deno.env.get("RESEND_FROM") ?? "Manifestação <no-reply@example.com>";

async function send(to: string, subject: string, html: string): Promise<void> {
  if (!RESEND_API_KEY) return; // sem chave configurada: no-op silencioso
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: RESEND_FROM, to, subject, html }),
  });
  if (!res.ok) throw new Error(`resend ${res.status}: ${await res.text()}`);
}

export function sendReceipt(to: string, itemId: string, amount: number): Promise<void> {
  const html = `
    <p>Obrigado pela compra!</p>
    <p>Item: <strong>${itemId}</strong><br/>Valor: R$ ${amount.toFixed(2)}</p>
    <p>Seu item já está liberado na avenida.</p>
  `;
  return send(to, "Recibo da sua compra — Manifestação Online", html);
}
