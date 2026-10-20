import { useCallback, useEffect, useState } from "react";
import {
  SIGN_COLORS,
  SIGN_INK,
  SIGN_MAX_TEXT,
  SIGN_PRICE_CENTS,
  type CustomSign,
  type SignStatus,
} from "@manifestacao/shared";
import { useModal } from "./useModal.js";
import { PixPanel } from "../shop/Store.js";
import type { PixCharge } from "../net/payments.js";
import { fetchMySigns, paySign, submitSign } from "../net/signs.js";

interface SignModalProps {
  /** Cartaz que o jogador está carregando (null = nenhum). */
  equippedId: string | null;
  onEquip: (id: string | null) => void;
  onClose: () => void;
}

const STATUS_LABEL: Record<SignStatus, string> = {
  review: "Em análise",
  awaiting_payment: "Aprovado — aguardando pagamento",
  active: "Ativo",
  rejected: "Recusado",
  refunded: "Estornado",
};

const brl = (cents: number) => `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;

/**
 * Cartaz personalizado: texto curto + cor, carregado pelo personagem. Passa por
 * filtro e fila de moderação; só depois de aprovado o Pix é gerado.
 */
export function SignModal({ equippedId, onEquip, onClose }: SignModalProps) {
  const dialogRef = useModal<HTMLDivElement>(onClose);
  const [text, setText] = useState("");
  const [color, setColor] = useState<string>(SIGN_COLORS[1]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [mine, setMine] = useState<CustomSign[]>([]);
  const [charge, setCharge] = useState<PixCharge | null>(null);

  const reload = useCallback(
    () => void fetchMySigns().then((list) => list && setMine(list)).catch(() => {}),
    [],
  );
  useEffect(() => {
    reload();
    const t = setInterval(() => document.visibilityState === "visible" && reload(), 4000);
    return () => clearInterval(t);
  }, [reload]);

  // Nada mais aguardando pagamento (pago ou expirado): sai da tela do Pix.
  useEffect(() => {
    if (charge && mine.length > 0 && !mine.some((m) => m.status === "awaiting_payment")) setCharge(null);
  }, [charge, mine]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await submitSign(text.trim(), color);
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
      const c = await paySign(id);
      if (c.paid) setNotice("Pagamento recebido! O cartaz fica ativo em instantes.");
      else setCharge(c);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao gerar o Pix.");
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
        aria-labelledby="sign-title"
        tabIndex={-1}
        style={{ width: "min(480px, 100%)", maxHeight: "calc(100dvh - 32px)", overflowY: "auto", outline: "none", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--r-lg)", padding: 20, display: "flex", flexDirection: "column", gap: 14 }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, position: "sticky", top: -20, background: "var(--surface)", zIndex: 1, padding: "20px 0 6px", margin: "-20px 0 -6px" }}>
          <h2 id="sign-title" style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 400, textTransform: "uppercase" }}>
            Cartaz
          </h2>
          <button type="button" onClick={onClose} style={ghostBtn}>
            Fechar
          </button>
        </div>

        {charge ? (
          <PixPanel
            charge={charge}
            onCancel={() => setCharge(null)}
            hint="Aguardando o Pix… assim que for confirmado, seu cartaz fica ativo e você pode carregá-lo."
          />
        ) : (
          <>
            <p style={hint}>
              Crie um cartaz com texto curto. Ele passa por análise antes de qualquer cobrança ({brl(SIGN_PRICE_CENTS)} por
              Pix, só depois de aprovado). Depois de ativo, você escolhe quando carregá-lo.
            </p>
            <form onSubmit={send} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <label style={label}>
                Texto do cartaz
                <input value={text} maxLength={SIGN_MAX_TEXT} onChange={(e) => setText(e.target.value)} required style={field} />
                <span style={{ ...hint, alignSelf: "flex-end" }}>{text.length}/{SIGN_MAX_TEXT}</span>
              </label>
              <div role="radiogroup" aria-label="Cor do cartaz" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {SIGN_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={color === c}
                    aria-label={`Cor ${c}`}
                    onClick={() => setColor(c)}
                    style={{ width: 44, height: 44, borderRadius: "var(--r-sm)", background: c, border: color === c ? "3px solid var(--accent)" : "1px solid var(--line)", cursor: "pointer" }}
                  />
                ))}
              </div>
              <div
                aria-label="Prévia do cartaz"
                style={{ background: color, color: SIGN_INK, border: `4px solid ${SIGN_INK}`, borderRadius: 6, minHeight: 72, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", fontWeight: 800, fontSize: 22, padding: 10, overflowWrap: "anywhere" }}
              >
                {text || "Seu texto aqui"}
              </div>
              {notice && <p role="status" style={{ margin: 0, fontSize: "var(--t-ui)", color: "var(--accent)" }}>{notice}</p>}
              {error && <p role="alert" style={{ margin: 0, fontSize: "var(--t-ui)", color: "var(--danger)" }}>{error}</p>}
              <button type="submit" disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>
                {busy ? "Enviando…" : "Enviar para análise"}
              </button>
            </form>

            <p style={hint}>Reembolso do Pix: pedido em até 6 horas após o pagamento.</p>
            {mine.length > 0 && (
              <section style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 260, overflowY: "auto" }}>
                <h3 style={{ margin: 0, fontSize: "var(--t-body)" }}>Seus cartazes</h3>
                {mine.map((m) => (
                  <div key={m.id} style={{ background: "var(--surface-2)", borderRadius: "var(--r-md)", padding: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: "var(--t-ui)", fontWeight: 700 }}>
                      <span style={{ background: m.color, color: SIGN_INK, padding: "2px 8px", borderRadius: 4, overflowWrap: "anywhere" }}>{m.text}</span>
                      <span style={{ color: m.status === "rejected" || m.status === "refunded" ? "var(--danger)" : m.status === "awaiting_payment" ? "var(--accent)" : "var(--ink-dim)", textAlign: "right" }}>
                        {STATUS_LABEL[m.status]}
                      </span>
                    </div>
                    {m.status === "awaiting_payment" && (
                      <button type="button" disabled={busy} onClick={() => void pay(m.id)} style={primaryBtn}>
                        Pagar {brl(SIGN_PRICE_CENTS)} com Pix
                      </button>
                    )}
                    {m.status === "active" && (
                      <button type="button" onClick={() => onEquip(equippedId === m.id ? null : m.id)} style={equippedId === m.id ? ghostBtn : primaryBtn}>
                        {equippedId === m.id ? "Guardar cartaz" : "Carregar este cartaz"}
                      </button>
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
