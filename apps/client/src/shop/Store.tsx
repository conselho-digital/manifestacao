import { useEffect, useRef, useState } from "react";
import { CHARACTERS, FLAGS, VEHICLES, isCharacterId, isFlagId, isVehicleId } from "@manifestacao/shared";
import { useAuth, signInWithGoogle, signOut } from "../auth/useAuth.js";
import { useCatalog, type CatalogItem } from "./useCatalog.js";
import { useEntitlements } from "./useEntitlements.js";
import { createPixCharge, type PixCharge } from "../net/payments.js";
import { isOnlineEnabled } from "../config/env.js";

function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Rótulo amigável a partir do id composto "kind:slug" do catálogo. */
function itemLabel(item: CatalogItem): string {
  const [, slug] = item.id.split(":");
  if (item.kind === "character" && isCharacterId(slug)) return CHARACTERS[slug].label;
  if (item.kind === "flag" && isFlagId(slug)) return FLAGS[slug].label;
  if (item.kind === "vehicle" && isVehicleId(slug)) return VEHICLES[slug].label;
  return item.label;
}

interface StoreProps {
  onClose: () => void;
}

/**
 * Loja: lista o catálogo, exige login Google para comprar, cria a cobrança
 * Pix via Edge Function e mostra o QR Code até a compra ser confirmada
 * (o webhook do Mercado Pago libera o item; aqui só fazemos polling do
 * próprio inventário — nunca liberamos nada no cliente sem confirmação).
 */
export function Store({ onClose }: StoreProps) {
  const { session, loading: authLoading } = useAuth();
  const { items, loading: catalogLoading } = useCatalog();
  const { owned, refresh } = useEntitlements(session);
  const [charge, setCharge] = useState<PixCharge | null>(null);
  const [pendingItem, setPendingItem] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Enquanto há uma cobrança aberta, confere a cada 3s se o item já foi
  // liberado (o webhook roda assíncrono, fora do nosso controle de tempo).
  useEffect(() => {
    if (!charge) return;
    pollRef.current = setInterval(() => void refresh(), 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [charge, refresh]);

  useEffect(() => {
    if (charge && pendingItem && owned.has(pendingItem)) {
      setCharge(null);
      setPendingItem(null);
    }
  }, [owned, charge, pendingItem]);

  async function buy(item: CatalogItem) {
    setError(null);
    try {
      setPendingItem(item.id);
      const c = await createPixCharge(item.id);
      setCharge(c);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao criar cobrança");
      setPendingItem(null);
    }
  }

  return (
    <div
      role="dialog"
      aria-label="Loja"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 20,
        background: "var(--scrim)",
        backdropFilter: "blur(2px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        style={{
          width: "min(480px, 94vw)",
          maxHeight: "86vh",
          overflowY: "auto",
          background: "var(--surface)",
          border: "1px solid var(--line)",
          borderRadius: "var(--r-lg)",
          padding: 20,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2
            style={{
              margin: 0,
              fontFamily: "var(--font-display)",
              fontSize: 28,
              fontWeight: 400,
              textTransform: "uppercase",
            }}
          >
            Loja
          </h2>
          <button type="button" onClick={onClose} style={closeBtnStyle}>
            Fechar
          </button>
        </div>

        {!isOnlineEnabled && (
          <p style={{ fontSize: "var(--t-ui)", color: "var(--ink-dim)" }}>
            Multiplayer/loja desativados (sem credenciais do Supabase neste ambiente).
          </p>
        )}

        {isOnlineEnabled && !authLoading && !session && (
          <button type="button" onClick={() => void signInWithGoogle()} style={primaryBtnStyle}>
            Entrar com Google para comprar
          </button>
        )}

        {session && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "var(--t-ui)" }}>
            <span style={{ color: "var(--ink-dim)" }}>{session.user.email}</span>
            <button type="button" onClick={() => void signOut()} style={linkBtnStyle}>
              Sair
            </button>
          </div>
        )}

        {error && <p style={{ color: "#ff6b6b", fontSize: "var(--t-ui)" }}>{error}</p>}

        {charge && (
          <PixPanel charge={charge} onCancel={() => { setCharge(null); setPendingItem(null); }} />
        )}

        {!charge && (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {catalogLoading && <li style={{ color: "var(--ink-dim)", fontSize: "var(--t-ui)" }}>Carregando…</li>}
            {items.map((item) => {
              const has = owned.has(item.id);
              const free = item.price_cents === 0;
              return (
                <li
                  key={item.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 12px",
                    borderRadius: "var(--r-md)",
                    background: "var(--surface-2)",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: "var(--t-body)" }}>{itemLabel(item)}</div>
                    <div style={{ fontSize: "var(--t-ui)", color: "var(--ink-dim)" }}>
                      {free ? "Grátis" : formatBRL(item.price_cents)}
                    </div>
                  </div>
                  {has || free ? (
                    <span style={{ fontSize: "var(--t-ui)", color: "var(--accent)", fontWeight: 700 }}>
                      {has ? "Adquirido" : "Disponível"}
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={!session || pendingItem === item.id}
                      onClick={() => void buy(item)}
                      style={buyBtnStyle}
                    >
                      {pendingItem === item.id ? "…" : "Comprar"}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function PixPanel({ charge, onCancel }: { charge: PixCharge; onCancel: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      <p style={{ margin: 0, fontSize: "var(--t-body)", textAlign: "center" }}>
        Escaneie o QR Code no app do seu banco ou copie o código Pix.
      </p>
      {charge.qrCodeBase64 && (
        <img
          src={`data:image/png;base64,${charge.qrCodeBase64}`}
          alt="QR Code Pix"
          style={{ width: 220, height: 220, borderRadius: "var(--r-md)", background: "#fff" }}
        />
      )}
      {charge.qrCode && (
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(charge.qrCode!).then(() => setCopied(true));
          }}
          style={primaryBtnStyle}
        >
          {copied ? "Copiado!" : "Copiar código Pix"}
        </button>
      )}
      <p style={{ margin: 0, fontSize: "var(--t-ui)", color: "var(--ink-dim)" }}>
        Aguardando confirmação do pagamento…
      </p>
      <button type="button" onClick={onCancel} style={linkBtnStyle}>
        Cancelar
      </button>
    </div>
  );
}

const closeBtnStyle: React.CSSProperties = {
  minHeight: 36,
  padding: "6px 14px",
  fontSize: "var(--t-ui)",
  borderRadius: "var(--r-sm)",
  border: "1px solid var(--line)",
  background: "transparent",
  color: "var(--ink)",
  cursor: "pointer",
};

const primaryBtnStyle: React.CSSProperties = {
  minHeight: 44,
  padding: "12px 20px",
  fontSize: 15,
  fontWeight: 700,
  borderRadius: "var(--r-md)",
  border: "none",
  background: "var(--accent)",
  color: "var(--on-accent)",
  cursor: "pointer",
};

const buyBtnStyle: React.CSSProperties = {
  minHeight: 36,
  padding: "8px 16px",
  fontSize: "var(--t-ui)",
  fontWeight: 700,
  borderRadius: "var(--r-sm)",
  border: "none",
  background: "var(--accent)",
  color: "var(--on-accent)",
  cursor: "pointer",
};

const linkBtnStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "var(--ink-dim)",
  fontSize: "var(--t-ui)",
  cursor: "pointer",
  textDecoration: "underline",
};
