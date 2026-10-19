import { useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { CHARACTERS, FLAGS, PASSES, VEHICLES, isCharacterId, isFlagId, isPassId, isVehicleId } from "@manifestacao/shared";
import { signInWithGoogle, signOut } from "../auth/useAuth.js";
import { useCatalog, type CatalogItem } from "./useCatalog.js";
import { createPixCharge, type PixCharge } from "../net/payments.js";
import { isOnlineEnabled } from "../config/env.js";
import { ProductThumb } from "./ProductThumb.js";

function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Rótulo amigável a partir do id composto "kind:slug" do catálogo. */
function itemLabel(item: CatalogItem): string {
  const [, slug] = item.id.split(":");
  if (item.kind === "character" && isCharacterId(slug)) return CHARACTERS[slug].label;
  if (item.kind === "flag" && isFlagId(slug)) return FLAGS[slug].label;
  if (item.kind === "vehicle" && isVehicleId(slug)) return VEHICLES[slug].label;
  if (item.kind === "pass" && isPassId(slug)) return PASSES[slug].label;
  return item.label;
}

/** Descrição opcional (hoje só o passe Premium tem). */
function itemDescription(item: CatalogItem): string | null {
  const [, slug] = item.id.split(":");
  if (item.kind === "pass" && isPassId(slug)) return PASSES[slug].description;
  return null;
}

interface StoreProps {
  onClose: () => void;
  session: Session | null;
  authLoading: boolean;
  owned: ReadonlySet<string>;
  refresh: () => Promise<void>;
}

/**
 * Loja: lista o catálogo, exige login Google para comprar, cria a cobrança
 * Pix via Edge Function e mostra o QR Code até a compra ser confirmada
 * (o webhook do Mercado Pago libera o item; aqui só fazemos polling do
 * próprio inventário — nunca liberamos nada no cliente sem confirmação).
 *
 * Sessão/posses vêm de cima (Game.tsx) para serem compartilhadas com o
 * gating do VehiclePicker, em vez de cada um buscar por conta própria.
 */
export function Store({ onClose, session, authLoading, owned, refresh }: StoreProps) {
  const { items, loading: catalogLoading } = useCatalog();
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
    if (pendingItem) return; // já há uma compra em andamento; evita duplo clique
    setError(null);
    setPendingItem(item.id);
    try {
      const c = await createPixCharge(item.id);
      if (c.paid) {
        // Já estava aprovado (corrida com o webhook); o servidor já concedeu
        // o item — não há QR Code para mostrar, só atualiza o inventário.
        await refresh();
        setPendingItem(null);
        return;
      }
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

        {error && <p style={{ color: "var(--danger)", fontSize: "var(--t-ui)" }}>{error}</p>}

        {charge && (
          <PixPanel charge={charge} onCancel={() => { setCharge(null); setPendingItem(null); }} />
        )}

        {!charge && (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
            {catalogLoading && <li style={{ color: "var(--ink-dim)", fontSize: "var(--t-ui)" }}>Carregando…</li>}
            {items.map((item) => {
              const has = owned.has(item.id);
              const free = item.price_cents === 0;
              const description = itemDescription(item);

              const priceLine = (
                <span
                  style={{
                    fontSize: "var(--t-ui)",
                    color: free ? "var(--ink-dim)" : "var(--ink)",
                    fontWeight: free ? 400 : 600,
                  }}
                >
                  {free ? "Grátis" : formatBRL(item.price_cents)}
                </span>
              );

              const action = has ? (
                <span style={{ fontSize: "var(--t-ui)", color: "var(--accent)", fontWeight: 700 }}>
                  Adquirido
                </span>
              ) : free ? (
                <span style={{ fontSize: "var(--t-ui)", color: "var(--ink-dim)" }}>Já disponível</span>
              ) : (
                <button
                  type="button"
                  disabled={!session || pendingItem !== null}
                  onClick={() => void buy(item)}
                  style={buyBtnStyle}
                >
                  {pendingItem === item.id ? "…" : "Comprar"}
                </button>
              );

              // Itens com descrição (ex. Premium) ganham layout empilhado,
              // full-width — um card de uma linha (nome+preço) não cabe uma
              // frase de benefícios sem ficar espremido contra o botão.
              if (description) {
                return (
                  <li
                    key={item.id}
                    style={{
                      padding: "12px",
                      borderRadius: "var(--r-md)",
                      background: "var(--surface-2)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: "var(--t-body)" }}>{itemLabel(item)}</div>
                    <div style={{ fontSize: "var(--t-ui)", color: "var(--ink-dim)" }}>{description}</div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 2 }}>
                      {priceLine}
                      {action}
                    </div>
                  </li>
                );
              }

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
                  <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                    <ProductThumb itemId={item.id} />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: "var(--t-body)" }}>{itemLabel(item)}</div>
                      {priceLine}
                    </div>
                  </div>
                  {action}
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
          onError={(e) => {
            // Base64 malformado/incompleto: esconde a imagem quebrada e deixa
            // o botão "copiar código Pix" como alternativa.
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
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
      <p style={{ margin: 0, fontSize: "var(--t-ui)", color: "var(--ink-dim)", textAlign: "center" }}>
        Aguardando confirmação do pagamento… a liberação do item costuma levar
        alguns segundos após o Pix ser pago. Pode fechar a loja: a confirmação
        acontece em segundo plano e o item aparece aqui na próxima vez que
        você abrir.
      </p>
      <button type="button" onClick={onCancel} style={linkBtnStyle}>
        Cancelar
      </button>
    </div>
  );
}

const closeBtnStyle: React.CSSProperties = {
  minHeight: 44,
  padding: "10px 16px",
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
  minHeight: 44,
  padding: "10px 18px",
  fontSize: "var(--t-ui)",
  fontWeight: 700,
  borderRadius: "var(--r-sm)",
  border: "none",
  background: "var(--accent)",
  color: "var(--on-accent)",
  cursor: "pointer",
};

const linkBtnStyle: React.CSSProperties = {
  minHeight: 44,
  padding: "10px 4px",
  background: "none",
  border: "none",
  color: "var(--ink-dim)",
  fontSize: "var(--t-ui)",
  cursor: "pointer",
  textDecoration: "underline",
};
