import { useEffect, useState } from "react";
import { useModal } from "./useModal.js";
import {
  CHARACTERS,
  CHARACTER_IDS,
  BILLBOARDS,
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
  fetchAdminCatalog,
  createCatalogItem,
  mergeModels,
  deleteCatalogItem,
  newProductId,
  NEW_PRODUCT_KINDS,
  fetchSuperchatQueue,
  moderateSuperchat,
  fetchBidQueue,
  grantAllItemsToMe,
  moderateBid,
  type AdminBid,
  fetchSignQueue,
  moderateSign,
  type AdminSign,
  type AdminSuperchat,
  saveCatalogItem,
  saveConfigKey,
  uploadModel,
  snapshotFile,
  type AdminCatalogRow,
  findUsers,
  sanctionUser,
  liftSanction,
  fetchSanctions,
  fetchModerationLog,
  type AdminUserHit,
  type AdminSanction,
  type AdminModLogRow,
} from "../config/adminApi.js";

interface AdminPanelProps {
  onClose: () => void;
  /** Recarrega a config do banco e reaplica no jogo. */
  onChanged: () => Promise<void>;
}

type Tab = "equipes" | "produtos" | "modelos" | "superchats" | "cartazes" | "telões" | "moderação" | "testes";
const TABS: { id: Tab; label: string }[] = [
  { id: "equipes", label: "Equipes e bandeiras" },
  { id: "produtos", label: "Produtos" },
  { id: "modelos", label: "Modelos 3D" },
  { id: "superchats", label: "Superchats" },
  { id: "cartazes", label: "Cartazes" },
  { id: "telões", label: "Telões" },
  { id: "moderação", label: "Moderação" },
  { id: "testes", label: "Testes" },
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
  const run = async (what: () => Promise<void | string>, okText: string) => {
    setBusy(true);
    setMsg(null);
    try {
      const custom = await what();
      await onChanged();
      setMsg({ kind: "ok", text: typeof custom === "string" ? custom : okText });
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

        <div role="tablist" style={{ display: "flex", gap: 6, overflowX: "auto", flexShrink: 0, paddingBottom: 4 }}>
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
              style={{ whiteSpace: "nowrap", flexShrink: 0,
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
        {tab === "produtos" && <ProductsTab busy={busy} run={run} />}
        {tab === "modelos" && <ModelsTab busy={busy} run={run} />}
        {tab === "superchats" && <SuperchatsTab busy={busy} run={run} />}
        {tab === "cartazes" && <SignsTab busy={busy} run={run} />}
        {tab === "telões" && <BidsTab busy={busy} run={run} />}
        {tab === "moderação" && <ModerationTab busy={busy} run={run} />}
        {tab === "testes" && <TestsTab busy={busy} run={run} />}
      </div>
    </div>
  );
}

interface TabProps {
  busy: boolean;
  run: (what: () => Promise<void | string>, okText: string) => Promise<void>;
}

function TeamsTab({ busy, run }: TabProps) {
  const [draft, setDraft] = useState(() =>
    Object.fromEntries(TEAM_IDS.map((id) => [id, { label: TEAMS[id].label, color: hexColor(TEAMS[id].color) }])) as Record<TeamId, { label: string; color: string }>,
  );
  const [models, setModels] = useState<Record<string, string>>(() => currentModelOverrides());
  const save = () =>
    run(
      () =>
        saveConfigKey(
          "teams",
          Object.fromEntries(TEAM_IDS.map((id) => [id, { label: draft[id].label.trim().slice(0, MAX_LABEL_LENGTH), color: toColorNumber(draft[id].color) }])),
        ),
      "Equipes salvas.",
    );
  const sendImage = (id: TeamId, file: File) =>
    run(async () => {
      const slot = `teamimg:${id}`;
      const url = await uploadModel(slot, await snapshotFile(file));
      setModels(await mergeModels({ [slot]: url }));
    }, "Imagem da bandeira da equipe enviada.");
  const clearImage = (id: TeamId) =>
    run(async () => {
      setModels(await mergeModels({ [`teamimg:${id}`]: null }));
    }, "Imagem removida (o spray volta a usar a cor da equipe).");
  return (
    <>
      <p style={hint}>
        Nome, cor e BANDEIRA de cada equipe (PNG, JPG ou WebP, até 2 MB; é convertida para WebP). Cada equipe tem uma
        única bandeira: a imagem aparece na bandeira que o personagem carrega a pé, no ícone da equipe e no spray. Sem
        imagem, usa a cor da equipe.
      </p>
      {TEAM_IDS.map((id) => {
        const url = models[`teamimg:${id}`];
        return (
          <div key={id} style={{ ...row, flexWrap: "wrap" }}>
            {url && <img src={url} alt={`Bandeira da equipe ${draft[id].label}`} style={{ width: 60, height: 36, objectFit: "cover", borderRadius: 4, border: "1px solid var(--line)" }} />}
            <input
              aria-label={`Nome da equipe ${id}`}
              value={draft[id].label}
              maxLength={MAX_LABEL_LENGTH}
              onChange={(e) => setDraft({ ...draft, [id]: { ...draft[id], label: e.target.value } })}
              style={{ ...input, flex: 1, minWidth: 120 }}
            />
            <input
              type="color"
              aria-label={`Cor da equipe ${id}`}
              value={draft[id].color}
              onChange={(e) => setDraft({ ...draft, [id]: { ...draft[id], color: e.target.value } })}
              style={colorInput}
            />
            <label style={{ ...ghostBtn, display: "inline-flex", alignItems: "center", opacity: busy ? 0.5 : 1 }}>
              {url ? "Trocar bandeira" : "Enviar bandeira"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={busy}
                style={{ display: "none" }}
                onChange={(e) => {
                  const input = e.target;
                  const f = input.files?.[0];
                  if (!f) return;
                  // Só limpa o input depois de copiar o arquivo (senão o Android revoga a leitura).
                  void sendImage(id, f).finally(() => {
                    input.value = "";
                  });
                }}
              />
            </label>
            {url && (
              <button type="button" disabled={busy} onClick={() => void clearImage(id)} style={ghostBtn}>
                Tirar imagem
              </button>
            )}
          </div>
        );
      })}
      <button type="button" disabled={busy} onClick={() => void save()} style={primaryBtn}>
        Salvar equipes
      </button>
    </>
  );
}

interface ProductDraft {
  id: string;
  label: string;
  price: string;
  active: boolean;
  /** Produto ainda não salvo no banco. */
  isNew?: boolean;
  kind?: string;
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

  const toCents = (price: string): number => {
    if (price.trim() === "" || Number.isNaN(Number(price.replace(",", ".")))) {
      throw new Error("Informe um preço válido (ex.: 29,90).");
    }
    return Math.round(Number(price.replace(",", ".")) * 100);
  };

  const add = () =>
    setRows([
      { id: newProductId("novo produto"), label: "Novo produto", price: "0.00", active: true, isNew: true, kind: "object" },
      ...rows,
    ]);

  const save = (r: ProductDraft) =>
    run(async () => {
      const row = { id: r.id, kind: r.kind ?? "", label: r.label, price_cents: toCents(r.price), active: r.active };
      if (r.isNew) {
        // O id nasce do nome ao salvar (o nome inicial é só um rascunho).
        const id = newProductId(r.label);
        await createCatalogItem({ ...row, id });
        setRows((cur) => (cur ?? []).map((x) => (x.id === r.id ? { ...x, id, isNew: false } : x)));
      } else {
        await saveCatalogItem({ ...row, kind: "" });
      }
    }, `"${r.label}" salvo.`);

  const remove = (r: ProductDraft) => {
    if (r.isNew) {
      setRows(rows.filter((x) => x.id !== r.id));
      return;
    }
    if (!window.confirm(`Apagar o produto "${r.label}"? Se já foi comprado, ele só é desativado (some da loja) para não perder o histórico.`)) return;
    void run(async () => {
      const result = await deleteCatalogItem(r.id);
      if (result === "deleted") {
        setRows((cur) => (cur ?? []).filter((x) => x.id !== r.id));
        return;
      }
      setRows((cur) => (cur ?? []).map((x) => (x.id === r.id ? { ...x, active: false } : x)));
      return `"${r.label}" já tem compras: foi desativado (some da loja) em vez de apagado.`;
    }, `"${r.label}" apagado.`);
  };

  return (
    <>
      <p style={hint}>
        Nome, preço (R$) e disponibilidade na loja. O preço cobrado no Pix é o daqui. Produto novo entra na loja como
        item avulso (a posse fica registrada; efeito no jogo depende de o jogo usar esse item).
      </p>
      <button type="button" disabled={busy} onClick={add} style={primaryBtn}>
        Adicionar produto
      </button>
      {rows.map((r) => (
        <div key={r.id} style={{ ...row, flexWrap: "wrap" }}>
          <span style={{ ...hint, width: "100%" }}>{r.isNew ? "Novo produto (ainda não salvo)" : r.id}</span>
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
          {r.isNew && (
            <select
              aria-label="Tipo do produto"
              value={r.kind}
              onChange={(e) => update(r.id, { kind: e.target.value })}
              style={{ ...input, width: 110 }}
            >
              {NEW_PRODUCT_KINDS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </select>
          )}
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--t-ui)", minHeight: 44 }}>
            <input type="checkbox" style={{ width: 22, height: 22 }} checked={r.active} onChange={(e) => update(r.id, { active: e.target.checked })} />
            Ativo
          </label>
          <button type="button" disabled={busy} onClick={() => void save(r)} style={ghostBtn}>
            Salvar
          </button>
          <button type="button" disabled={busy} onClick={() => remove(r)} style={{ ...ghostBtn, color: "var(--danger)" }}>
            Apagar
          </button>
        </div>
      ))}
    </>
  );
}

function ModelsTab({ busy, run }: TabProps) {
  const [models, setModels] = useState<Record<string, string>>(() => currentModelOverrides());

  const setSlot = (slot: string, file: File) =>
    run(async () => {
      const url = await uploadModel(slot, await snapshotFile(file));
      setModels(await mergeModels({ [slot]: url }));
    }, "Modelo enviado.");

  const clearSlot = (slot: string) =>
    run(async () => {
      setModels(await mergeModels({ [slot]: null }));
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
              const input = e.target;
              const f = input.files?.[0];
              if (!f) return;
              void setSlot(slot, f).finally(() => {
                input.value = "";
              });
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
            <span style={{ overflowWrap: "anywhere" }}>
              {r.name} <span style={{ ...hint, fontWeight: 400 }}>· {new Date(r.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
            </span>
            <span>R$ {(r.amount_cents / 100).toFixed(2).replace(".", ",")}</span>
          </div>
          <span style={{ fontSize: "var(--t-body)", overflowWrap: "anywhere" }}>{r.message}</span>
          <div style={row}>
            <button type="button" disabled={busy} onClick={() => void decide(r, true)} style={{ ...primaryBtn, flex: 1, padding: "10px 20px" }}>
              Aprovar
            </button>
            <button type="button" disabled={busy} onClick={() => void decide(r, false)} style={{ ...ghostBtn, flex: 1, color: "var(--danger)", borderColor: "var(--danger)" }}>
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

const MUTE_OPTIONS: { label: string; minutes: number }[] = [
  { label: "15 min", minutes: 15 },
  { label: "1 hora", minutes: 60 },
  { label: "24 horas", minutes: 1440 },
  { label: "7 dias", minutes: 10080 },
];

function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "permanente";
}

const MOD_ACTION_LABEL: Record<string, string> = {
  mute: "silenciou",
  ban: "baniu",
  lift_mute: "tirou o silêncio de",
  lift_ban: "tirou o banimento de",
};

/** Silenciar/banir contas: busca por apelido ou e-mail, sanções ativas e histórico de ações. */
function ModerationTab({ busy, run }: TabProps) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<AdminUserHit[] | null>(null);
  const [reason, setReason] = useState("");
  const [active, setActive] = useState<AdminSanction[] | null>(null);
  const [log, setLog] = useState<AdminModLogRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = () =>
    Promise.all([fetchSanctions(), fetchModerationLog()])
      .then(([a, l]) => {
        setActive(a);
        setLog(l);
      })
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : "Erro ao carregar."));
  useEffect(() => {
    void load();
  }, []);

  const search = () =>
    run(async () => {
      setHits(await findUsers(q));
    }, "Busca feita.");

  const apply = async (u: AdminUserHit, kind: "mute" | "ban", minutes: number | null) => {
    if (kind === "ban" && !window.confirm(`Banir ${u.nickname} permanentemente?`)) return;
    await run(async () => {
      await sanctionUser(u.id, kind, minutes, reason);
      setReason("");
      setHits(await findUsers(q));
      await load();
    }, kind === "mute" ? "Conta silenciada." : "Conta banida.");
  };

  const lift = (s: AdminSanction) =>
    run(async () => {
      await liftSanction(s.id);
      if (hits) setHits(await findUsers(q));
      await load();
    }, "Sanção removida.");

  if (loadError) return <p style={{ ...hint, color: "var(--danger)" }}>{loadError}</p>;

  return (
    <>
      <p style={hint}>
        Silenciar bloqueia o chat e o envio de conteúdo; banir impede de entrar na avenida e de comprar. Vale por conta
        Google (não guardamos IP). Contas de admin não podem ser sancionadas.
      </p>
      <form
        style={row}
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Apelido ou e-mail (2+ letras)" aria-label="Buscar conta" style={{ ...input, flex: 1, minWidth: 0 }} />
        <button type="submit" disabled={busy || q.trim().length < 2} style={ghostBtn}>
          Buscar
        </button>
      </form>
      <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="Motivo (opcional, aparece para a conta)" aria-label="Motivo" style={input} />

      {hits?.length === 0 && <p style={hint}>Nenhuma conta encontrada.</p>}
      {hits?.map((u) => (
        <div key={u.id} style={{ border: "1px solid var(--line)", borderRadius: "var(--r-md)", padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontWeight: 700, fontSize: "var(--t-ui)", overflowWrap: "anywhere" }}>
            {u.nickname} <span style={{ ...hint, fontWeight: 400 }}>{u.email}</span>
            {u.muted && <span style={{ color: "var(--danger)" }}> · silenciado</span>}
            {u.banned && <span style={{ color: "var(--danger)" }}> · banido</span>}
          </div>
          <div style={{ ...row, flexWrap: "wrap" }}>
            {MUTE_OPTIONS.map((o) => (
              <button key={o.minutes} type="button" disabled={busy} onClick={() => void apply(u, "mute", o.minutes)} style={ghostBtn}>
                Silenciar {o.label}
              </button>
            ))}
          </div>
          <div style={row}>
            <button type="button" disabled={busy} onClick={() => void apply(u, "ban", null)} style={{ ...ghostBtn, color: "var(--danger)", borderColor: "var(--danger)" }}>
              Banir permanentemente
            </button>
          </div>
        </div>
      ))}

      <h3 style={sectionTitle}>Sanções ativas</h3>
      {!active && <p style={hint}>Carregando…</p>}
      {active?.length === 0 && <p style={hint}>Nenhuma sanção ativa.</p>}
      {active?.map((s) => (
        <div key={s.id} style={{ ...row, justifyContent: "space-between", border: "1px solid var(--line)", borderRadius: "var(--r-md)", padding: 10 }}>
          <span style={{ fontSize: "var(--t-ui)", overflowWrap: "anywhere" }}>
            <strong>{s.nickname ?? "?"}</strong> · {s.kind === "ban" ? "banido" : "silenciado"} · até {fmtDate(s.expires_at)}
            {s.reason ? ` · ${s.reason}` : ""}
          </span>
          <button type="button" disabled={busy} onClick={() => void lift(s)} style={ghostBtn}>
            Remover
          </button>
        </div>
      ))}

      <h3 style={sectionTitle}>Histórico</h3>
      {log?.length === 0 && <p style={hint}>Sem ações registradas.</p>}
      {log?.map((l, i) => (
        <p key={i} style={{ ...hint, overflowWrap: "anywhere" }}>
          {fmtDate(l.created_at)} · {l.actor_nickname ?? "sistema"} {MOD_ACTION_LABEL[l.action] ?? l.action} {l.target ?? ""}
          {l.reason ? ` (${l.reason})` : ""}
        </p>
      ))}
    </>
  );
}

function SignsTab({ busy, run }: TabProps) {
  const [rows, setRows] = useState<AdminSign[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = () =>
    fetchSignQueue()
      .then(setRows)
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : "Erro ao carregar a fila."));
  useEffect(() => {
    void load();
  }, []);

  if (loadError) return <p style={{ ...hint, color: "var(--danger)" }}>{loadError}</p>;
  if (!rows) return <p style={hint}>Carregando…</p>;

  const decide = (r: AdminSign, approve: boolean) =>
    run(async () => {
      await moderateSign(r.id, approve);
      await load();
    }, approve ? "Aprovado: o autor já pode pagar." : "Recusado.");

  return (
    <>
      <p style={hint}>
        Fila de cartazes. Aprovar libera a cobrança do Pix para o autor; o cartaz só aparece no jogo depois do pagamento
        confirmado.
      </p>
      {rows.length === 0 && <p style={hint}>Nenhum cartaz aguardando.</p>}
      {rows.map((r) => (
        <div key={r.id} style={{ border: "1px solid var(--line)", borderRadius: "var(--r-md)", padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ background: r.color, color: "#1a1d21", borderRadius: 4, padding: "8px 10px", fontWeight: 800, fontSize: "var(--t-body)", overflowWrap: "anywhere" }}>
            {r.text}
          </div>
          <span style={{ ...hint }}>
            Enviado às {new Date(r.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </span>
          <div style={row}>
            <button type="button" disabled={busy} onClick={() => void decide(r, true)} style={{ ...primaryBtn, flex: 1, padding: "10px 20px" }}>
              Aprovar
            </button>
            <button type="button" disabled={busy} onClick={() => void decide(r, false)} style={{ ...ghostBtn, flex: 1, color: "var(--danger)", borderColor: "var(--danger)" }}>
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

function TestsTab({ busy, run }: TabProps) {
  return (
    <>
      <p style={hint}>
        Ferramentas para testar tudo sem pagar. Sua conta admin já usa todos os itens da loja (veículos, personagens,
        bandeiras, passe Premium e os produtos criados depois).
      </p>
      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h3 style={sectionTitle}>Itens</h3>
        <p style={hint}>Grava no banco todos os itens do catálogo na sua conta (útil se você apagou alguma posse).</p>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const n = await grantAllItemsToMe();
              return n > 0 ? `${n} item(ns) novo(s) concedido(s) à sua conta.` : "Sua conta já tinha todos os itens.";
            }, "Itens concedidos.")
          }
          style={primaryBtn}
        >
          Dar todos os itens a mim
        </button>
      </section>
      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h3 style={sectionTitle}>Superchat, Cartaz e Telões</h3>
        <p style={hint}>
          Envie o seu próprio superchat, cartaz ou lance, aprove na aba correspondente e, no próprio menu, use "Ativar sem
          pagar (teste de admin)". Nada é cobrado e a ação fica no registro de moderação.
        </p>
      </section>
    </>
  );
}

function BidsTab({ busy, run }: TabProps) {
  const [rows, setRows] = useState<AdminBid[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = () =>
    fetchBidQueue()
      .then(setRows)
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : "Erro ao carregar a fila."));
  useEffect(() => {
    void load();
  }, []);

  if (loadError) return <p style={{ ...hint, color: "var(--danger)" }}>{loadError}</p>;
  if (!rows) return <p style={hint}>Carregando…</p>;

  const decide = (r: AdminBid, approve: boolean) =>
    run(async () => {
      await moderateBid(r.id, approve);
      await load();
    }, approve ? "Aprovado: o autor já pode pagar." : "Recusado.");

  return (
    <>
      <p style={hint}>
        Fila de lances dos telões. Aprovar libera o pagamento; o anúncio só vai ao ar depois de pago, e só se continuar
        sendo o maior lance.
      </p>
      {rows.length === 0 && <p style={hint}>Nenhum lance aguardando.</p>}
      {rows.map((r) => (
        <div key={r.id} style={{ border: "1px solid var(--line)", borderRadius: "var(--r-md)", padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontWeight: 700, fontSize: "var(--t-ui)" }}>
            <span>{BILLBOARDS.find((b) => b.id === r.billboard_id)?.label ?? r.billboard_id}</span>
            <span>R$ {(r.amount_cents / 100).toFixed(2).replace(".", ",")}</span>
          </div>
          <div style={{ background: r.color, color: "#1a1d21", borderRadius: 4, padding: "8px 10px", fontWeight: 800, fontSize: "var(--t-body)", overflowWrap: "anywhere" }}>
            {r.text}
          </div>
          <span style={hint}>
            Enviado às {new Date(r.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </span>
          <div style={row}>
            <button type="button" disabled={busy} onClick={() => void decide(r, true)} style={{ ...primaryBtn, flex: 1, padding: "10px 20px" }}>
              Aprovar
            </button>
            <button type="button" disabled={busy} onClick={() => void decide(r, false)} style={{ ...ghostBtn, flex: 1, color: "var(--danger)", borderColor: "var(--danger)" }}>
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
