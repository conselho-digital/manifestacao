import { useCallback, useEffect, useState } from "react";
import {
  SUPERCHAT_MAX_CENTS,
  SUPERCHAT_MAX_MESSAGE,
  SUPERCHAT_MAX_NAME,
  SUPERCHAT_MIN_CENTS,
  type Superchat,
  type SuperchatStatus,
} from "@manifestacao/shared";
import { useModal } from "./useModal.js";
import { InfoButton, InfoPanel } from "./InfoButton.js";
import { PixPanel } from "../shop/Store.js";
import type { PixCharge } from "../net/payments.js";
import { fetchMySuperchats, paySuperchat, submitSuperchat } from "../net/superchat.js";
import { testActivate } from "../config/adminApi.js";

interface SuperchatModalProps {
  defaultName: string;
  /** Conta admin: pode ativar um superchat aprovado sem pagar (teste). */
  isAdmin?: boolean;
  onClose: () => void;
}

const STATUS_LABEL: Record<SuperchatStatus, string> = {
  review: "Em análise",
  awaiting_payment: "Aprovado — aguardando pagamento",
  paid: "Pago e exibido",
  rejected: "Recusado",
  refunded: "Estornado",
};

const brl = (cents: number) => `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;

/**
 * Superchat: envia nome + mensagem + valor (R$ 5 a R$ 200). O conteúdo passa por
 * filtro automático e fila de moderação; só depois de aprovado o Pix é gerado.
 */
export function SuperchatModal({ defaultName, isAdmin = false, onClose }: SuperchatModalProps) {
  const dialogRef = useModal<HTMLDivElement>(onClose);
  const [info, setInfo] = useState(false);
  const [name, setName] = useState(defaultName);
  const [message, setMessage] = useState("");
  const [amount, setAmount] = useState("10");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mine, setMine] = useState<Superchat[]>([]);
  const [charge, setCharge] = useState<PixCharge | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = useCallback(
    () => void fetchMySuperchats().then((list) => list && setMine(list)).catch(() => {}),
    [],
  );
  useEffect(() => {
    reload();
    // Atualiza o status enquanto o modal está aberto (aprovação/pagamento); pausa com a aba oculta.
    const t = setInterval(() => document.visibilityState === "visible" && reload(), 4000);
    return () => clearInterval(t);
  }, [reload]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const cents = Math.round(Number(amount.replace(",", ".")) * 100);
    if (!Number.isFinite(cents) || cents < SUPERCHAT_MIN_CENTS || cents > SUPERCHAT_MAX_CENTS) {
      setError("Valor entre R$ 5,00 e R$ 200,00.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await submitSuperchat(name.trim(), message.trim(), cents);
      setMessage("");
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao enviar.");
    } finally {
      setBusy(false);
    }
  };

  const pay = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      const c = await paySuperchat(id);
      if (c.paid) setNotice("Pagamento recebido! Sua mensagem aparece em instantes.");
      else setCharge(c);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao gerar o Pix.");
    } finally {
      setBusy(false);
    }
  };

  const adminActivate = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      await testActivate("superchat", id);
      setNotice("Ativado sem pagar (teste de admin).");
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao ativar.");
    } finally {
      setBusy(false);
    }
  };

  // Nada mais aguardando pagamento (pago ou expirado): sai da tela do Pix.
  useEffect(() => {
    if (charge && mine.length > 0 && !mine.some((m) => m.status === "awaiting_payment")) setCharge(null);
  }, [charge, mine]);

  return (
    <div
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      style={{ position: "fixed", inset: 0, zIndex: 20, background: "var(--scrim)", backdropFilter: "blur(2px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="superchat-title"
        tabIndex={-1}
        style={{ width: "min(480px, 100%)", maxHeight: "calc(100dvh - 32px)", overflowY: "auto", outline: "none", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--r-lg)", padding: 20, display: "flex", flexDirection: "column", gap: 14 }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, position: "sticky", top: -20, background: "var(--surface)", zIndex: 1, padding: "20px 0 6px", margin: "-20px 0 -6px" }}>
          <h2 id="superchat-title" style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 400, textTransform: "uppercase" }}>
            Superchat
          </h2>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <InfoButton open={info} onClick={() => setInfo((v) => !v)} label="O que é e onde aparece" />
            <button type="button" onClick={onClose} style={ghostBtn}>
              Fechar
            </button>
          </div>
        </div>
        {info && <InfoPanel what="Uma mensagem sua em destaque para todos os jogadores. Você escreve o nome e o texto, escolhe o valor (R$ 5 a R$ 200) e paga por Pix depois que a equipe aprovar." where="Num banner no topo da tela de todos os jogadores online, por alguns segundos (quanto maior o valor, mais tempo fica no ar)." />}

        {charge ? (
          <PixPanel
            charge={charge}
            onCancel={() => setCharge(null)}
            hint="Aguardando o Pix… assim que for confirmado, sua mensagem aparece em destaque para todos."
          />
        ) : (
          <>
            <p style={hint}>
              Sua mensagem passa por análise antes de qualquer cobrança. Depois de aprovada, você paga por Pix e ela
              aparece em destaque (quanto maior o valor, mais tempo).
            </p>
            <form onSubmit={send} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <label style={label}>
                Nome
                <input value={name} maxLength={SUPERCHAT_MAX_NAME} onChange={(e) => setName(e.target.value)} required style={field} />
              </label>
              <label style={label}>
                Mensagem
                <textarea
                  value={message}
                  maxLength={SUPERCHAT_MAX_MESSAGE}
                  onChange={(e) => setMessage(e.target.value)}
                  required
                  rows={3}
                  style={{ ...field, resize: "vertical", fontFamily: "inherit" }}
                />
                <span style={{ ...hint, alignSelf: "flex-end" }}>{message.length}/{SUPERCHAT_MAX_MESSAGE}</span>
              </label>
              <label style={label}>
                Valor (R$ 5 a R$ 200)
                <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required style={field} />
              </label>
              {notice && (
                <p role="status" style={{ margin: 0, fontSize: "var(--t-ui)", color: "var(--accent)" }}>
                  {notice}
                </p>
              )}
              {error && (
                <p role="alert" style={{ margin: 0, fontSize: "var(--t-ui)", color: "var(--danger)" }}>
                  {error}
                </p>
              )}
              <button type="submit" disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>
                {busy ? "Enviando…" : "Enviar para análise"}
              </button>
            </form>

            <p style={hint}>Reembolso do Pix: pedido em até 6 horas após o pagamento.</p>
            {mine.length > 0 && (
              <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <h3 style={{ margin: 0, fontSize: "var(--t-body)" }}>Seus superchats</h3>
                {mine.map((m) => (
                  <div key={m.id} style={{ background: "var(--surface-2)", borderRadius: "var(--r-md)", padding: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: "var(--t-ui)", fontWeight: 700 }}>
                      <span>{brl(m.amount_cents)}</span>
                      <span style={{ color: m.status === "rejected" || m.status === "refunded" ? "var(--danger)" : m.status === "awaiting_payment" ? "var(--accent)" : m.status === "paid" ? "var(--ink)" : "var(--ink-dim)" }}>
                        {STATUS_LABEL[m.status]}
                      </span>
                    </div>
                    <span style={{ fontSize: "var(--t-body)", overflowWrap: "anywhere" }}>{m.message}</span>
                    {m.status === "awaiting_payment" && (
                      isAdmin ? (
                        <button type="button" disabled={busy} onClick={() => void adminActivate(m.id)} style={primaryBtn}>
                          Ativar grátis (admin)
                        </button>
                      ) : (
                        <button type="button" disabled={busy} onClick={() => void pay(m.id)} style={primaryBtn}>
                          Pagar {brl(m.amount_cents)} com Pix
                        </button>
                      )
                    )}
                  </div>
                ))}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const hint: React.CSSProperties = { margin: 0, fontSize: "var(--t-ui)", color: "var(--ink-dim)" };
const label: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 4, fontSize: "var(--t-ui)", fontWeight: 700 };
const field: React.CSSProperties = {
  minHeight: 44,
  padding: "10px 12px",
  fontSize: 16,
  borderRadius: "var(--r-sm)",
  border: "1px solid var(--line)",
  background: "var(--surface-2)",
  color: "var(--ink)",
};
const ghostBtn: React.CSSProperties = {
  minHeight: 44,
  padding: "6px 14px",
  borderRadius: "var(--r-sm)",
  border: "1px solid var(--line)",
  background: "transparent",
  color: "var(--ink)",
  fontSize: "var(--t-ui)",
  cursor: "pointer",
};
const primaryBtn: React.CSSProperties = {
  minHeight: 44,
  padding: "12px 20px",
  fontSize: "var(--t-body)",
  fontWeight: 700,
  borderRadius: "var(--r-md)",
  border: "none",
  background: "var(--accent)",
  color: "var(--on-accent)",
  cursor: "pointer",
};
