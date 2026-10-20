import { useEffect, useState } from "react";
import { useModal } from "./useModal.js";
import {
  CHARACTERS,
  CHARACTER_IDS,
  FLAGS,
  FLAG_IDS,
  TEAMS,
  TEAM_IDS,
  VEHICLES,
  VEHICLE_IDS,
  hexColor,
  type TeamId,
} from "@manifestacao/shared";
import {
  MAX_LABEL_LENGTH,
  currentModelOverrides,
  isModelSlot,
} from "../config/gameConfig.js";
import {
  createSpray,
  fetchAdminSprays,
  newSprayId,
  removeSpray,
  updateSpray,
  type AdminSpray,
  fetchAdminCatalog,
  fetchSuperchatQueue,
  moderateSuperchat,
  type AdminSuperchat,
  saveCatalogItem,
  saveConfigKey,
  uploadModel,
  type AdminCatalogRow,
} from "../config/adminApi.js";

interface AdminPanelProps {
  onClose: () => void;
  /** Recarrega a config do banco e reaplica no jogo. */
  onChanged: () => Promise<void>;
}

type Tab = "equipes" | "bandeiras" | "produtos" | "sprays" | "modelos" | "superchats";
const TABS: { id: Tab; label: string }[] = [
  { id: "equipes", label: "Equipes" },
  { id: "bandeiras", label: "Bandeiras" },
  { id: "produtos", label: "Produtos" },
  { id: "sprays", label: "Sprays" },
  { id: "modelos", label: "Modelos 3D" },
  { id: "superchats", label: "Superchats" },
];

function toColorNumber(hex: string): number {
  return parseInt(hex.replace("#", ""), 16);
}

/**
 * Painel de admin (só aparece para contas admin; o RLS do Supabase é quem
 * garante isso de verdade). Edita equipes, bandeiras, produtos e os arquivos
 * 3D (.glb) de personagens (por equipe), veículos, bandeiras e spray.
 */
export function AdminPanel({ onClose, onChanged }: AdminPanelProps) {
  const [tab, setTab] = useState<Tab>("equipes");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const dialogRef = useModal<HTMLDivElement>(onClose);

  /** Roda uma escrita, recarrega a config e mostra o resultado. */
  const run = async (what: () => Promise<void>, okText: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await what();
      await onChanged();
      setMsg({ kind: "ok", text: okText });
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Erro ao salvar." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={overlay} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="admin-title" tabIndex={-1} style={{ ...card, outline: "none" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 id="admin-title" style={title}>Painel de admin</h2>
          <button type="button" onClick={onClose} style={ghostBtn}>
            Fechar
          </button>
        </div>

        <div role="tablist" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => {
                setTab(t.id);
                setMsg(null);
              }}
              style={{
                ...ghostBtn,
                background: tab === t.id ? "var(--accent)" : "transparent",
                color: tab === t.id ? "var(--on-accent)" : "var(--ink)",
                borderColor: tab === t.id ? "var(--accent)" : "var(--line)",
                fontWeight: 700,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {msg && (
          <p role={msg.kind === "err" ? "alert" : "status"} style={{ margin: 0, fontSize: "var(--t-ui)", color: msg.kind === "ok" ? "var(--accent)" : "var(--danger)" }}>
            {msg.kind === "ok" ? "Salvo: " : "Erro: "}{msg.text}
          </p>
        )}

        {tab === "equipes" && <TeamsTab busy={busy} run={run} />}
        {tab === "bandeiras" && <FlagsTab busy={busy} run={run} />}
        {tab === "produtos" && <ProductsTab busy={busy} run={run} />}
        {tab === "sprays" && <SpraysTab busy={busy} run={run} />}
        {tab === "modelos" && <ModelsTab busy={busy} run={run} />}
        {tab === "superchats" && <SuperchatsTab busy={busy} run={run} />}
      </div>
    </div>
  );
}

interface TabProps {
  busy: boolean;
  run: (what: () => Promise<void>, okText: string) => Promise<void>;
}

function TeamsTab({ busy, run }: TabProps) {
  const [draft, setDraft] = useState(() =>
    Object.fromEntries(TEAM_IDS.map((id) => [id, { label: TEAMS[id].label, color: hexColor(TEAMS[id].color) }])) as Record<TeamId, { label: string; color: string }>,
  );
  const save = () =>
    run(
      () =>
        saveConfigKey(
          "teams",
          Object.fromEntries(TEAM_IDS.map((id) => [id, { label: draft[id].label.trim().slice(0, MAX_LABEL_LENGTH), color: toColorNumber(draft[id].color) }])),
        ),
      "Equipes salvas.",
    );
  return (
    <>
      <p style={hint}>Nome e cor de cada equipe (a cor também pinta a camisa e a bandeira "Do meu time").</p>
      {TEAM_IDS.map((id) => (
        <div key={id} style={row}>
          <input
            aria-label={`Nome da equipe ${id}`}
            value={draft[id].label}
            maxLength={MAX_LABEL_LENGTH}
            onChange={(e) => setDraft({ ...draft, [id]: { ...draft[id], label: e.target.value } })}
            style={{ ...input, flex: 1 }}
          />
          <input
            type="color"
            aria-label={`Cor da equipe ${id}`}
            value={draft[id].color}
            onChange={(e) => setDraft({ ...draft, [id]: { ...draft[id], color: e.target.value } })}
            style={colorInput}
          />
        </div>
      ))}
      <button type="button" disabled={busy} onClick={() => void save()} style={primaryBtn}>
        Salvar equipes
      </button>
    </>
  );
}

function FlagsTab({ busy, run }: TabProps) {
  const ids = FLAG_IDS.filter((id) => id !== "nenhuma" && id !== "time");
  const [draft, setDraft] = useState(() =>
    Object.fromEntries(ids.map((id) => [id, { label: FLAGS[id].label, color: hexColor(FLAGS[id].color ?? 0xffffff) }])) as Record<string, { label: string; color: string }>,
  );
  const save = () =>
    run(
      () =>
        saveConfigKey(
          "flags",
          Object.fromEntries(ids.map((id) => [id, { label: draft[id]!.label.trim().slice(0, MAX_LABEL_LENGTH), color: toColorNumber(draft[id]!.color) }])),
        ),
      "Bandeiras salvas.",
    );
  return (
    <>
      <p style={hint}>Nome e cor das bandeiras. A bandeira "Do meu time" usa a cor da equipe (aba Equipes).</p>
      {ids.map((id) => (
        <div key={id} style={row}>
          <input
            aria-label={`Nome da bandeira ${id}`}
            value={draft[id]!.label}
            maxLength={MAX_LABEL_LENGTH}
            onChange={(e) => setDraft({ ...draft, [id]: { ...draft[id]!, label: e.target.value } })}
            style={{ ...input, flex: 1 }}
          />
          <input
            type="color"
            aria-label={`Cor da bandeira ${id}`}
            value={draft[id]!.color}
            onChange={(e) => setDraft({ ...draft, [id]: { ...draft[id]!, color: e.target.value } })}
            style={colorInput}
          />
        </div>
      ))}
      <button type="button" disabled={busy} onClick={() => void save()} style={primaryBtn}>
        Salvar bandeiras
      </button>
    </>
  );
}

interface ProductDraft {
  id: string;
  label: string;
  price: string;
  active: boolean;
}

function ProductsTab({ busy, run }: TabProps) {
  const [rows, setRows] = useState<ProductDraft[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    fetchAdminCatalog()
      .then((list: AdminCatalogRow[]) =>
        setRows(list
          .filter((r) => !r.id.startsWith("spray:"))
          .map((r) => ({ id: r.id, label: r.label, price: (r.price_cents / 100).toFixed(2), active: r.active }))),
      )
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : "Erro ao carregar produtos."));
  }, []);

  if (loadError) return <p style={{ ...hint, color: "var(--danger)" }}>{loadError}</p>;
  if (!rows) return <p style={hint}>Carregando…</p>;

  const update = (id: string, patch: Partial<ProductDraft>) =>
    setRows(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const save = (r: ProductDraft) =>
    run(
      async () => {
        if (r.price.trim() === "" || Number.isNaN(Number(r.price.replace(",", ".")))) {
          throw new Error("Informe um preço válido (ex.: 29,90).");
        }
        await saveCatalogItem({
          id: r.id,
          kind: "",
          label: r.label,
          price_cents: Math.round(Number(r.price.replace(",", ".")) * 100),
          active: r.active,
        });
      },
      `"${r.label}" salvo.`,
    );

  return (
    <>
      <p style={hint}>Nome, preço (R$) e disponibilidade na loja. O preço cobrado no Pix é o daqui.</p>
      {rows.map((r) => (
        <div key={r.id} style={{ ...row, flexWrap: "wrap" }}>
          <span style={{ ...hint, width: "100%" }}>{r.id}</span>
          <input
            aria-label={`Nome de ${r.id}`}
            value={r.label}
            maxLength={MAX_LABEL_LENGTH}
            onChange={(e) => update(r.id, { label: e.target.value })}
            style={{ ...input, flex: 1, minWidth: 140 }}
          />
          <input
            aria-label={`Preço de ${r.id} em reais`}
            inputMode="decimal"
            value={r.price}
            onChange={(e) => update(r.id, { price: e.target.value })}
            style={{ ...input, width: 90 }}
          />
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--t-ui)", minHeight: 44 }}>
            <input type="checkbox" style={{ width: 22, height: 22 }} checked={r.active} onChange={(e) => update(r.id, { active: e.target.checked })} />
            Ativo
          </label>
          <button type="button" disabled={busy} onClick={() => void save(r)} style={ghostBtn}>
            Salvar
          </button>
        </div>
      ))}
    </>
  );
}

function SpraysTab({ busy, run }: TabProps) {
  const [rows, setRows] = useState<(AdminSpray & { price: string; isNew?: boolean })[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [models, setModels] = useState<Record<string, string>>(() => currentModelOverrides());

  const load = () =>
    fetchAdminSprays()
      .then((list) => setRows(list.map((r) => ({ ...r, price: (r.price_cents / 100).toFixed(2) }))))
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : "Erro ao carregar sprays."));

  useEffect(() => {
    void load();
  }, []);

  if (loadError) return <p style={{ ...hint, color: "var(--danger)" }}>{loadError}</p>;
  if (!rows) return <p style={hint}>Carregando…</p>;

  const update = (slug: string, patch: Partial<AdminSpray & { price: string }>) =>
    setRows(rows.map((r) => (r.slug === slug ? { ...r, ...patch } : r)));

  const toCents = (price: string): number => {
    if (price.trim() === "" || Number.isNaN(Number(price.replace(",", ".")))) {
      throw new Error("Informe um preço válido (ex.: 9,90).");
    }
    return Math.round(Number(price.replace(",", ".")) * 100);
  };

  const add = () =>
    setRows([
      ...rows,
      {
        slug: newSprayId("spray"),
        label: "Novo spray",
        price_cents: 0,
        price: "0.00",
        active: true,
        color: null,
        sort_order: rows.length + 1,
        isNew: true,
      },
    ]);

  const save = (r: AdminSpray & { price: string; isNew?: boolean }) =>
    run(async () => {
      const spray: AdminSpray = { ...r, price_cents: toCents(r.price) };
      const slug = r.isNew ? newSprayId(r.label) : r.slug;
      if (r.isNew) await createSpray({ ...spray, slug });
      else await updateSpray(spray);
      // Só a linha salva é atualizada: edições não salvas das outras linhas ficam.
      setRows((cur) =>
        (cur ?? []).map((x) =>
          x.slug === r.slug ? { ...x, slug, price_cents: spray.price_cents, price: (spray.price_cents / 100).toFixed(2), isNew: false } : x,
        ),
      );
    }, `"${r.label}" salvo.`);

  const remove = (r: AdminSpray & { isNew?: boolean }) => {
    if (r.isNew) {
      setRows(rows.filter((x) => x.slug !== r.slug));
      return;
    }
    if (!window.confirm(`Remover o spray "${r.label}"? Ele some do jogo e da loja (quem já comprou não perde o registro).`)) return;
    void run(async () => {
      await removeSpray(r.slug);
      // Tira também o modelo 3D do spray (senão fica um override órfão na config).
      const next = { ...currentModelOverrides() };
      if (delete next[`spray:${r.slug}`]) await saveConfigKey("models", next);
      setRows((cur) => (cur ?? []).filter((x) => x.slug !== r.slug));
    }, "Spray removido.");
  };

  const upload = (r: AdminSpray, file: File) =>
    run(async () => {
      const slot = `spray:${r.slug}`;
      const url = await uploadModel(slot, file);
      const next = { ...currentModelOverrides(), [slot]: url };
      await saveConfigKey("models", next);
      setModels(next);
    }, "Modelo 3D do spray enviado.");

  const clearModel = (r: AdminSpray) =>
    run(async () => {
      const next = { ...currentModelOverrides() };
      delete next[`spray:${r.slug}`];
      await saveConfigKey("models", next);
      setModels(next);
    }, "Modelo removido (volta ao padrão).");

  return (
    <>
      <p style={hint}>
        Opções de spray da loja: nome, preço, cor da marca e arquivo 3D (.glb). Preço 0 = livre pra todos. Sem cor, usa
        a cor da equipe. Salve cada spray novo antes de enviar o arquivo 3D.
      </p>
      {rows.length === 0 && <p style={hint}>Nenhum spray extra ainda — só o Clássico (padrão).</p>}
      {rows.map((r) => {
        const has = Boolean(models[`spray:${r.slug}`]);
        return (
          <div key={r.slug} style={{ ...row, flexWrap: "wrap", padding: "8px 0" }}>
            <input
              aria-label="Nome do spray"
              value={r.label}
              maxLength={MAX_LABEL_LENGTH}
              onChange={(e) => update(r.slug, { label: e.target.value })}
              style={{ ...input, flex: 1, minWidth: 140 }}
            />
            <input
              aria-label="Preço do spray em reais"
              inputMode="decimal"
              value={r.price}
              onChange={(e) => update(r.slug, { price: e.target.value })}
              style={{ ...input, width: 90 }}
            />
            <input
              type="color"
              aria-label="Cor da marca"
              value={hexColor(r.color ?? 0x2ecc71)}
              onChange={(e) => update(r.slug, { color: toColorNumber(e.target.value) })}
              style={colorInput}
            />
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--t-ui)", minHeight: 44 }}>
              <input type="checkbox" style={{ width: 22, height: 22 }} checked={r.color === null} onChange={(e) => update(r.slug, { color: e.target.checked ? null : 0x2ecc71 })} />
              Cor da equipe
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--t-ui)", minHeight: 44 }}>
              <input type="checkbox" style={{ width: 22, height: 22 }} checked={r.active} onChange={(e) => update(r.slug, { active: e.target.checked })} />
              Ativo
            </label>
            <button type="button" disabled={busy} onClick={() => void save(r)} style={ghostBtn}>
              Salvar
            </button>
            {!r.isNew && (
              <>
                <label style={{ ...ghostBtn, display: "inline-flex", alignItems: "center", opacity: busy ? 0.5 : 1 }}>
                  {has ? "Trocar 3D" : "Enviar 3D (.glb)"}
                  <input
                    type="file"
                    accept=".glb,model/gltf-binary"
                    disabled={busy}
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (f) void upload(r, f);
                    }}
                  />
                </label>
                {has && (
                  <button type="button" disabled={busy} onClick={() => void clearModel(r)} style={ghostBtn}>
                    Tirar 3D
                  </button>
                )}
              </>
            )}
            <button type="button" disabled={busy} onClick={() => remove(r)} style={{ ...ghostBtn, color: "var(--danger)" }}>
              Remover
            </button>
          </div>
        );
      })}
      <button type="button" disabled={busy} onClick={add} style={primaryBtn}>
        Adicionar spray
      </button>
    </>
  );
}

function ModelsTab({ busy, run }: TabProps) {
  const [models, setModels] = useState<Record<string, string>>(() => currentModelOverrides());

  const setSlot = (slot: string, file: File) =>
    run(async () => {
      const url = await uploadModel(slot, file);
      const next = { ...models, [slot]: url };
      await saveConfigKey("models", next);
      setModels(next);
    }, "Modelo enviado.");

  const clearSlot = (slot: string) =>
    run(async () => {
      const next = { ...models };
      delete next[slot];
      await saveConfigKey("models", next);
      setModels(next);
    }, "Modelo removido (volta ao padrão).");

  const renderSlot = (slot: string, label: string) => {
    if (!isModelSlot(slot)) return null;
    const has = Boolean(models[slot]);
    return (
      <div key={slot} style={{ ...row, justifyContent: "space-between", flexWrap: "wrap" }}>
        <span style={{ fontSize: "var(--t-ui)", flex: 1, minWidth: 0 }}>
          {label}
          <span style={{ color: has ? "var(--accent)" : "var(--ink-dim)", marginLeft: 6 }}>{has ? "• enviado" : "• padrão"}</span>
        </span>
        <label style={{ ...ghostBtn, display: "inline-flex", alignItems: "center", opacity: busy ? 0.5 : 1 }}>
          {has ? "Trocar" : "Enviar .glb"}
          <input
            type="file"
            accept=".glb,model/gltf-binary"
            disabled={busy}
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void setSlot(slot, f);
            }}
          />
        </label>
        {has && (
          <button type="button" disabled={busy} onClick={() => void clearSlot(slot)} style={ghostBtn}>
            Remover
          </button>
        )}
      </div>
    );
  };

  return (
    <>
      <p style={hint}>
        Arquivos .glb (até 15 MB). Personagem: vale o da equipe, senão o geral, senão o padrão.
      </p>

      <h3 style={sectionTitle}>Personagens</h3>
      {CHARACTER_IDS.map((c) => (
        <div key={c} style={{ display: "flex", flexDirection: "column", gap: 4, padding: "8px 0" }}>
          <strong style={{ fontSize: "var(--t-ui)" }}>{CHARACTERS[c].label}</strong>
          {renderSlot(`character:${c}`, "Geral (todas as equipes)")}
          {TEAM_IDS.map((t) => (
            renderSlot(`character:${c}:${t}`, `Equipe ${TEAMS[t].label}`)
          ))}
        </div>
      ))}

      <h3 style={sectionTitle}>Veículos</h3>
      {VEHICLE_IDS.filter((v) => v !== "nenhum").map((v) => (
        renderSlot(`vehicle:${v}`, VEHICLES[v].label)
      ))}

      <h3 style={sectionTitle}>Bandeiras</h3>
      {FLAG_IDS.filter((f) => f !== "nenhuma").map((f) => (
        renderSlot(`flag:${f}`, FLAGS[f].label)
      ))}

      <h3 style={sectionTitle}>Spray</h3>
      {renderSlot("spray", "Marca do spray (usada no lugar da mancha)")}
    </>
  );
}

function SuperchatsTab({ busy, run }: TabProps) {
  const [rows, setRows] = useState<AdminSuperchat[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = () =>
    fetchSuperchatQueue()
      .then(setRows)
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : "Erro ao carregar a fila."));
  useEffect(() => {
    void load();
  }, []);

  if (loadError) return <p style={{ ...hint, color: "var(--danger)" }}>{loadError}</p>;
  if (!rows) return <p style={hint}>Carregando…</p>;

  const decide = (r: AdminSuperchat, approve: boolean) =>
    run(async () => {
      await moderateSuperchat(r.id, approve);
      await load();
    }, approve ? "Aprovado: o autor já pode pagar." : "Recusado.");

  return (
    <>
      <p style={hint}>
        Fila de análise. Aprovar libera a cobrança do Pix para o autor; a mensagem só aparece no jogo depois do
        pagamento confirmado.
      </p>
      {rows.length === 0 && <p style={hint}>Nenhum superchat aguardando.</p>}
      {rows.map((r) => (
        <div key={r.id} style={{ border: "1px solid var(--line)", borderRadius: "var(--r-md)", padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontWeight: 700, fontSize: "var(--t-ui)" }}>
            <span style={{ overflowWrap: "anywhere" }}>{r.name}</span>
            <span>R$ {(r.amount_cents / 100).toFixed(2).replace(".", ",")}</span>
          </div>
          <span style={{ fontSize: "var(--t-body)", overflowWrap: "anywhere" }}>{r.message}</span>
          <div style={row}>
            <button type="button" disabled={busy} onClick={() => void decide(r, true)} style={primaryBtn}>
              Aprovar
            </button>
            <button type="button" disabled={busy} onClick={() => void decide(r, false)} style={ghostBtn}>
              Recusar
            </button>
          </div>
        </div>
      ))}
      <button type="button" disabled={busy} onClick={() => void load()} style={ghostBtn}>
        Atualizar fila
      </button>
    </>
  );
}

const overlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 30,
  background: "var(--scrim)",
  backdropFilter: "blur(2px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
};
const card: React.CSSProperties = {
  width: "min(600px, 100%)",
  maxHeight: "calc(100dvh - 32px)",
  overflowY: "auto",
  background: "var(--surface)",
  border: "1px solid var(--line)",
  borderRadius: "var(--r-lg)",
  padding: 20,
  display: "flex",
  flexDirection: "column",
  gap: 14,
};
const title: React.CSSProperties = {
  margin: 0,
  fontFamily: "var(--font-display)",
  fontSize: 28,
  fontWeight: 400,
  textTransform: "uppercase",
};
const sectionTitle: React.CSSProperties = {
  margin: "10px 0 0",
  fontSize: "var(--t-ui)",
  color: "var(--ink-dim)",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
};
const hint: React.CSSProperties = { margin: 0, fontSize: "var(--t-ui)", color: "var(--ink-dim)" };
const row: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8 };
const input: React.CSSProperties = {
  minHeight: 44,
  padding: "8px 12px",
  fontSize: "var(--t-body)",
  borderRadius: "var(--r-md)",
  border: "1px solid var(--line)",
  background: "var(--surface-2)",
  color: "var(--ink)",
};
const colorInput: React.CSSProperties = {
  width: 48,
  height: 44,
  padding: 2,
  border: "1px solid var(--line)",
  borderRadius: "var(--r-md)",
  background: "var(--surface-2)",
  cursor: "pointer",
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
  minHeight: 48,
  borderRadius: "var(--r-lg)",
  border: "none",
  background: "var(--accent)",
  color: "var(--on-accent)",
  fontSize: "var(--t-body)",
  fontWeight: 800,
  cursor: "pointer",
};
