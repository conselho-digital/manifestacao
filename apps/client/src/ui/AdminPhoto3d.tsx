import { useEffect, useRef, useState } from "react";
import { CHARACTERS, CHARACTER_IDS, TEAMS, TEAM_IDS, type CharacterId, type TeamId } from "@manifestacao/shared";
import { generateCharacterFromPhoto, mergeModels, snapshotFile } from "../config/adminApi.js";

interface Props {
  busy: boolean;
  run: (what: () => Promise<void | string>, okText: string) => Promise<void>;
}

const field: React.CSSProperties = {
  minHeight: 44,
  padding: "8px 12px",
  fontSize: "var(--t-body)",
  borderRadius: "var(--r-md)",
  border: "1px solid var(--line)",
  background: "var(--surface-2)",
  color: "var(--ink)",
};
const ghost: React.CSSProperties = {
  minHeight: 44,
  padding: "6px 14px",
  borderRadius: "var(--r-sm)",
  border: "1px solid var(--line)",
  background: "transparent",
  color: "var(--ink)",
  fontSize: "var(--t-ui)",
  cursor: "pointer",
};
const primary: React.CSSProperties = {
  minHeight: 48,
  borderRadius: "var(--r-lg)",
  border: "none",
  background: "var(--accent)",
  color: "var(--on-accent)",
  fontSize: "var(--t-body)",
  fontWeight: 800,
  cursor: "pointer",
};
const hint: React.CSSProperties = { margin: 0, fontSize: "var(--t-ui)", color: "var(--ink-dim)" };

/** Aba "Foto → 3D": envia uma foto e gera um personagem .glb (com esqueleto, se der) para usar num slot de personagem. */
export function AdminPhoto3d({ busy, run }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [rights, setRights] = useState(false);
  const [working, setWorking] = useState(false);
  const [progress, setProgress] = useState<{ text: string; percent: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string; rigged: boolean } | null>(null);
  const [character, setCharacter] = useState<CharacterId>(CHARACTER_IDS[0]!);
  const [team, setTeam] = useState<TeamId | "">("");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => {
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const generate = async () => {
    if (!file) return;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setWorking(true);
    setError(null);
    setResult(null);
    try {
      setResult(await generateCharacterFromPhoto(file, (text, percent) => setProgress({ text, percent }), ctrl.signal));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao gerar o personagem.");
    } finally {
      setWorking(false);
      setProgress(null);
    }
  };

  const slot = team ? `character:${character}:${team}` : `character:${character}`;
  const use = () => {
    if (!result) return;
    void run(async () => {
      await mergeModels({ [slot]: result.url });
    }, "Personagem aplicado.");
  };

  return (
    <>
      <p style={hint}>
        Envie uma foto de corpo inteiro (de frente, fundo limpo) e o gerador cria um modelo 3D. Leva alguns minutos. Use só imagens suas, de
        personagens fictícios ou com autorização de quem aparece: o conteúdo é de responsabilidade do operador.
      </p>
      <label style={{ ...ghost, display: "inline-flex", alignItems: "center", alignSelf: "flex-start", opacity: working ? 0.5 : 1 }}>
        {file ? "Trocar foto" : "Escolher foto"}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={working}
          style={{ display: "none" }}
          onChange={(e) => {
            const input = e.target;
            const f = input.files?.[0];
            if (!f) return;
            void snapshotFile(f)
              .then((copy) => {
                setFile(copy);
                setResult(null);
                setError(null);
              })
              .catch((err: unknown) => setError(err instanceof Error ? err.message : "Falha ao ler o arquivo."))
              .finally(() => {
                input.value = "";
              });
          }}
        />
      </label>
      {preview && <img src={preview} alt="Foto escolhida" style={{ maxHeight: 220, maxWidth: "100%", objectFit: "contain", alignSelf: "flex-start", borderRadius: 8 }} />}
      <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: "var(--t-ui)" }}>
        <input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} style={{ width: 22, height: 22, flexShrink: 0 }} />
        Tenho direito de usar esta imagem (é minha, fictícia ou autorizada).
      </label>
      <button type="button" disabled={!file || !rights || working || busy} onClick={() => void generate()} style={{ ...primary, opacity: !file || !rights || working ? 0.5 : 1 }}>
        {working ? "Gerando…" : "Gerar personagem 3D"}
      </button>
      {working && (
        <>
          <button type="button" onClick={() => abortRef.current?.abort()} style={ghost}>
            Cancelar
          </button>
          {progress && (
            <p role="status" style={hint}>
              {progress.text} {progress.percent > 0 ? `${Math.round(progress.percent)}%` : ""}
            </p>
          )}
        </>
      )}
      {error && (
        <p role="alert" style={{ margin: 0, color: "var(--danger)", fontSize: "var(--t-ui)" }}>
          {error}
        </p>
      )}
      {result && (
        <>
          <p role="status" style={{ ...hint, color: "var(--ink)" }}>
            Pronto! {result.rigged ? "O modelo tem esqueleto: vai andar no jogo." : "O modelo ficou sem esqueleto (balança o corpo todo ao andar)."}
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <select aria-label="Personagem" value={character} onChange={(e) => setCharacter(e.target.value as CharacterId)} style={{ ...field, flex: "1 1 160px" }}>
              {CHARACTER_IDS.map((c) => (
                <option key={c} value={c}>
                  {CHARACTERS[c].label}
                </option>
              ))}
            </select>
            <select aria-label="Equipe" value={team} onChange={(e) => setTeam(e.target.value as TeamId | "")} style={{ ...field, flex: "1 1 160px" }}>
              <option value="">Todas as equipes</option>
              {TEAM_IDS.map((t) => (
                <option key={t} value={t}>
                  {TEAMS[t].label}
                </option>
              ))}
            </select>
          </div>
          <button type="button" disabled={busy} onClick={use} style={primary}>
            Usar neste personagem
          </button>
          <a href={result.url} target="_blank" rel="noreferrer" style={{ ...hint, textDecoration: "underline" }}>
            Baixar o .glb
          </a>
        </>
      )}
    </>
  );
}
