import { useCallback, useEffect, useRef, useState } from "react";
import {
  BID_MAX_CENTS,
  BID_MAX_TEXT,
  BILLBOARDS,
  SIGN_COLORS,
  SIGN_INK,
  nextMinBid,
  type BidStatus,
  type BillboardAd,
  type MyBid,
} from "@manifestacao/shared";
import { useModal } from "./useModal.js";
import { PixPanel } from "../shop/Store.js";
import type { PixCharge } from "../net/payments.js";
import { fetchMyBids, fetchMyCredit, payBid, payBidWithCredit, submitBid } from "../net/billboards.js";

interface BillboardModalProps {
  /** Lances no ar por telão (do Realtime). */
  ads: Map<string, BillboardAd>;
  onClose: () => void;
}

const STATUS_LABEL: Record<BidStatus, string> = {
  review: "Em análise",
  awaiting_payment: "Aprovado — aguardando pagamento",
  active: "No ar",
  outbid: "Superado — valor virou crédito",
  rejected: "Recusado",
  refunded: "Estornado",
};

const COLOR_NAMES: Record<string, string> = { "#f8f9fa": "branco", "#ffd43b": "amarelo", "#51cf66": "verde", "#4dabf7": "azul", "#ff6b6b": "vermelho", "#b197fc": "roxo" };
const brl = (cents: number) => `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;
const boardLabel = (id: string) => BILLBOARDS.find((b) => b.id === id)?.label ?? id;

/**
 * Leilão dos telões: quem dá o maior lance (e paga) exibe. Antes de cobrar, o texto
 * passa por filtro e aprovação. Se o lance é superado, o valor vira crédito.
 */
export function BillboardModal({ ads, onClose }: BillboardModalProps) {
  const dialogRef = useModal<HTMLDivElement>(onClose);
  const [board, setBoard] = useState<string>(BILLBOARDS[0]!.id);
  const [text, setText] = useState("");
  const [color, setColor] = useState<string>(SIGN_COLORS[1]);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [mine, setMine] = useState<MyBid[]>([]);
  const [credit, setCredit] = useState(0);
  const [charge, setCharge] = useState<PixCharge | null>(null);

  const current = ads.get(board) ?? null;
  const minCents = nextMinBid(current ? current.amount_cents : null);

  const reload = useCallback(() => {
    void fetchMyBids().then((l) => l && setMine(l)).catch(() => {});
    void fetchMyCredit().then((c) => c != null && setCredit(c)).catch(() => {});
  }, []);
  useEffect(() => {
    reload();
    const t = setInterval(() => document.visibilityState === "visible" && reload(), 4000);
    return () => clearInterval(t);
  }, [reload]);

  // Sugere o lance mínimo ao trocar de telão (ou quando o lance no ar muda).
  // Só troca o valor se o campo ainda estava no mínimo anterior (não apaga o que a pessoa digitou).
  const lastMinRef = useRef<number | null>(null);
  useEffect(() => {
    const prevMin = lastMinRef.current == null ? null : (lastMinRef.current / 100).toFixed(2).replace(".", ",");
    lastMinRef.current = minCents;
    setAmount((cur) => (cur === "" || cur === prevMin ? (minCents / 100).toFixed(2).replace(".", ",") : cur));
  }, [board, minCents]);

  useEffect(() => {
    if (charge && mine.length > 0 && !mine.some((m) => m.status === "awaiting_payment")) setCharge(null);
  }, [charge, mine]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const cents = Math.round(Number(amount.replace(",", ".")) * 100);
    if (!Number.isFinite(cents) || cents < minCents || cents > BID_MAX_CENTS) {
      setError(`Lance entre ${brl(minCents)} e ${brl(BID_MAX_CENTS)}.`);
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await submitBid(board, text.trim(), color, cents);
      setText("");
      setNotice("Enviado para análise. Você só paga depois da aprovação.");
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
      const c = await payBid(id);
      if (c.paid) setNotice("Pagamento recebido! Seu anúncio entra no ar em instantes.");
      else setCharge(c);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao gerar o Pix.");
    } finally {
      setBusy(false);
    }
  };

  const payCredit = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      await payBidWithCredit(id);
      setNotice("Pago com crédito!");
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao pagar com crédito.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      style={{ position: "fixed", inset: 0, zIndex: 20, background: "var(--scrim)", backdropFilter: "blur(2px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bb-title"
        tabIndex={-1}
        style={{ width: "min(520px, 100%)", maxHeight: "calc(100dvh - 32px)", overflowY: "auto", outline: "none", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--r-lg)", padding: 20, display: "flex", flexDirection: "column", gap: 14 }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, position: "sticky", top: -20, background: "var(--surface)", zIndex: 1, padding: "20px 0 6px", margin: "-20px 0 -6px" }}>
          <h2 id="bb-title" style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 400, textTransform: "uppercase" }}>
            Telões
          </h2>
          <button type="button" onClick={onClose} style={ghostBtn}>
            Fechar
          </button>
        </div>

        {charge ? (
          <PixPanel
            charge={charge}
            onCancel={() => setCharge(null)}
            hint="Aguardando o Pix… assim que for confirmado, seu anúncio entra no ar. Se alguém cobrir o seu lance antes disso, o valor pago vira crédito."
          />
        ) : (
          <>
            <p style={hint}>
              Quem dá o maior lance exibe no telão. O texto passa por análise antes de qualquer cobrança. Se alguém cobrir
              seu lance, o valor volta como crédito.
              {credit > 0 && <strong style={{ color: "var(--accent)" }}> Seu crédito: {brl(credit)}.</strong>}
            </p>

            <div role="radiogroup" aria-label="Telão" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {BILLBOARDS.map((b) => {
                const ad = ads.get(b.id);
                const sel = board === b.id;
                return (
                  <button
                    key={b.id}
                    type="button"
                    role="radio"
                    aria-checked={sel}
                    onClick={() => setBoard(b.id)}
                    style={{ ...ghostBtn, flex: "1 1 140px", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2, borderColor: sel ? "var(--accent)" : "var(--line)", borderWidth: sel ? 2 : 1, textAlign: "left" }}
                  >
                    <strong>{b.label}</strong>
                    <span style={{ ...hint, overflowWrap: "anywhere" }}>{ad ? `${brl(ad.amount_cents)} — ${ad.text}` : "Livre"}</span>
                  </button>
                );
              })}
            </div>

            <form onSubmit={send} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <label style={label}>
                Texto do anúncio
                <input value={text} maxLength={BID_MAX_TEXT} onChange={(e) => setText(e.target.value)} required style={field} />
                <span style={{ ...hint, alignSelf: "flex-end" }}>{text.length}/{BID_MAX_TEXT}</span>
              </label>
              <div role="radiogroup" aria-label="Cor do anúncio" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {SIGN_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={color === c}
                    aria-label={`Cor ${COLOR_NAMES[c] ?? c}`}
                    onClick={() => setColor(c)}
                    style={{ width: 44, height: 44, borderRadius: "var(--r-sm)", background: c, border: color === c ? "3px solid var(--accent)" : "1px solid var(--line)", cursor: "pointer" }}
                  />
                ))}
              </div>
              <div
                aria-label="Prévia do anúncio"
                style={{ background: color, color: SIGN_INK, border: `4px solid ${SIGN_INK}`, borderRadius: 6, minHeight: 72, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", fontWeight: 800, fontSize: 22, padding: 10, overflowWrap: "anywhere" }}
              >
                {text || "Seu anúncio aqui"}
              </div>
              <label style={label}>
                Seu lance (mínimo {brl(minCents)})
                <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required style={field} />
              </label>
              {notice && <p role="status" style={{ margin: 0, fontSize: "var(--t-ui)", color: "var(--accent)" }}>{notice}</p>}
              {error && <p role="alert" style={{ margin: 0, fontSize: "var(--t-ui)", color: "var(--danger)" }}>{error}</p>}
              <button type="submit" disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>
                {busy ? "Enviando…" : "Enviar lance para análise"}
              </button>
            </form>

            <p style={hint}>Reembolso do Pix: pedido em até 6 horas após o pagamento.</p>
            {mine.length > 0 && (
              <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <h3 style={{ margin: 0, fontSize: "var(--t-body)" }}>Seus lances</h3>
                {mine.map((m) => (
                  <div key={m.id} style={{ background: "var(--surface-2)", borderRadius: "var(--r-md)", padding: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: "var(--t-ui)", fontWeight: 700 }}>
                      <span>{boardLabel(m.billboard_id)} · {brl(m.amount_cents)}</span>
                      <span style={{ textAlign: "right", color: m.status === "rejected" || m.status === "refunded" ? "var(--danger)" : m.status === "awaiting_payment" || m.status === "active" ? "var(--accent)" : "var(--ink-dim)" }}>
                        {STATUS_LABEL[m.status]}
                      </span>
                    </div>
                    <span style={{ fontSize: "var(--t-body)", overflowWrap: "anywhere" }}>{m.text}</span>
                    {m.status === "awaiting_payment" && (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button type="button" disabled={busy} onClick={() => void pay(m.id)} style={{ ...primaryBtn, flex: "1 1 160px" }}>
                          Pagar {brl(m.amount_cents)} com Pix
                        </button>
                        {credit >= m.amount_cents && (
                          <button type="button" disabled={busy} onClick={() => void payCredit(m.id)} style={{ ...ghostBtn, flex: "1 1 160px" }}>
                            Pagar com crédito
                          </button>
                        )}
                      </div>
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
