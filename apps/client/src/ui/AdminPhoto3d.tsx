import { useEffect, useMemo, useRef, useState } from "react";
import { AmbientLight, Color, DirectionalLight, Group, PerspectiveCamera, Scene, WebGLRenderer } from "three";
import { CHARACTERS, CHARACTER_IDS, TEAMS, TEAM_IDS, type CharacterId, type TeamId } from "@manifestacao/shared";
import { mergeModels, snapshotFile, uploadModel } from "../config/adminApi.js";
import { buildCharacter, exportGlb, loadPhoto, makeCutout, type Cutout, type LoadedPhoto } from "../config/photoTo3d.js";

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

/** Prévia 3D giratória do personagem gerado (three puro, num canvas pequeno). */
function Preview({ model }: { model: Group }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
    } catch {
      return;
    }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.setSize(260, 320, false);
    const scene = new Scene();
    scene.background = new Color(0x2a2f38);
    scene.add(new AmbientLight(0xffffff, 1.6));
    const sun = new DirectionalLight(0xffffff, 1.6);
    sun.position.set(2, 4, 3);
    scene.add(sun);
    const cam = new PerspectiveCamera(32, 260 / 320, 0.1, 50);
    cam.position.set(0, 1.0, 5.2);
    cam.lookAt(0, 0.9, 0);
    scene.add(model);
    let raf = 0;
    const loop = () => {
      model.rotation.y += 0.012;
      renderer.render(scene, cam);
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => {
      cancelAnimationFrame(raf);
      scene.remove(model);
      model.rotation.y = 0;
      renderer.dispose();
    };
  }, [model]);
  return <canvas ref={ref} width={260} height={320} aria-label="Prévia 3D do personagem" style={{ width: 260, height: 320, borderRadius: 8, alignSelf: "flex-start", maxWidth: "100%" }} />;
}

/** Aba "Foto → 3D": gera, no navegador, um boneco 3D com esqueleto a partir de uma foto de corpo inteiro. */
export function AdminPhoto3d({ busy, run }: Props) {
  const [photo, setPhoto] = useState<LoadedPhoto | null>(null);
  const [tolerance, setTolerance] = useState(40);
  const [rights, setRights] = useState(false);
  const [cut, setCut] = useState<Cutout | null>(null);
  const [cutError, setCutError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [model, setModel] = useState<Group | null>(null);
  const [glb, setGlb] = useState<Blob | null>(null);
  const [character, setCharacter] = useState<CharacterId>(CHARACTER_IDS[0]!);
  const [team, setTeam] = useState<TeamId | "">("");
  const cutRef = useRef<HTMLCanvasElement>(null);

  // Refaz o recorte ao trocar a foto ou a tolerância (rápido: a foto já está em memória).
  useEffect(() => {
    if (!photo) return;
    const t = window.setTimeout(() => {
      try {
        setCut(makeCutout(photo, tolerance));
        setCutError(null);
      } catch (e) {
        setCut(null);
        setCutError(e instanceof Error ? e.message : "Não consegui recortar a foto.");
      }
    }, 120);
    return () => window.clearTimeout(t);
  }, [photo, tolerance]);

  useEffect(() => {
    const canvas = cutRef.current;
    if (!canvas || !cut) return;
    canvas.width = cut.w;
    canvas.height = cut.h;
    const ctx = canvas.getContext("2d");
    ctx?.clearRect(0, 0, cut.w, cut.h);
    ctx?.drawImage(cut.canvas, 0, 0);
  }, [cut]);

  useEffect(() => {
    setModel(null);
    setGlb(null);
  }, [cut]);

  const onFile = (f: File) =>
    snapshotFile(f)
      .then(loadPhoto)
      .then((p) => {
        setPhoto(p);
        setError(null);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Falha ao ler o arquivo."));

  const generate = async () => {
    if (!cut) return;
    setWorking(true);
    setError(null);
    try {
      const root = buildCharacter(cut);
      setGlb(await exportGlb(root));
      setModel(root);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao gerar o personagem.");
    } finally {
      setWorking(false);
    }
  };

  const glbUrl = useMemo(() => (glb ? URL.createObjectURL(glb) : null), [glb]);
  useEffect(() => () => (glbUrl ? URL.revokeObjectURL(glbUrl) : undefined), [glbUrl]);

  const slot = useMemo(() => (team ? `character:${character}:${team}` : `character:${character}`), [character, team]);
  const use = () => {
    if (!glb) return;
    void run(async () => {
      const url = await uploadModel(slot, new File([glb], "personagem.glb", { type: "model/gltf-binary" }));
      await mergeModels({ [slot]: url });
    }, "Personagem aplicado.");
  };

  return (
    <>
      <p style={hint}>
        Gera um boneco 3D com esqueleto a partir de uma foto, aqui no navegador (sem serviço externo, sem custo). Use foto de corpo inteiro, de
        frente, braços ao lado do corpo, pés levemente separados, em fundo liso (ou PNG sem fundo). O rosto e a roupa vêm da foto, achatados;
        é um boneco estilizado, não um escaneamento. Use só imagens suas, fictícias ou autorizadas: o conteúdo é de responsabilidade do operador.
      </p>
      <label style={{ ...ghost, display: "inline-flex", alignItems: "center", alignSelf: "flex-start", opacity: working ? 0.5 : 1 }}>
        {photo ? "Trocar foto" : "Escolher foto"}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={working}
          style={{ display: "none" }}
          onChange={(e) => {
            const input = e.target;
            const f = input.files?.[0];
            if (!f) return;
            void onFile(f).finally(() => {
              input.value = "";
            });
          }}
        />
      </label>

      {photo && (
        <>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "var(--t-ui)" }}>
            Tolerância do fundo: {tolerance}
            <input type="range" min={10} max={110} value={tolerance} onChange={(e) => setTolerance(Number(e.target.value))} />
          </label>
          {cutError && (
            <p role="alert" style={{ margin: 0, color: "var(--danger)", fontSize: "var(--t-ui)" }}>
              {cutError}
            </p>
          )}
          {cut && (
            <>
              <p style={hint}>Recorte (confira se pegou só a pessoa):</p>
              <canvas
                ref={cutRef}
                aria-label="Recorte da pessoa"
                style={{ maxHeight: 260, maxWidth: "100%", objectFit: "contain", alignSelf: "flex-start", borderRadius: 8, background: "repeating-conic-gradient(#555 0% 25%, #444 0% 50%) 50% / 16px 16px" }}
              />
            </>
          )}
          <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: "var(--t-ui)" }}>
            <input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} style={{ width: 22, height: 22, flexShrink: 0 }} />
            Tenho direito de usar esta imagem (é minha, fictícia ou autorizada).
          </label>
          <button type="button" disabled={!cut || !rights || working || busy} onClick={() => void generate()} style={{ ...primary, opacity: !cut || !rights || working ? 0.5 : 1 }}>
            {working ? "Gerando…" : "Gerar personagem 3D"}
          </button>
        </>
      )}

      {error && (
        <p role="alert" style={{ margin: 0, color: "var(--danger)", fontSize: "var(--t-ui)" }}>
          {error}
        </p>
      )}

      {model && glb && (
        <>
          <Preview model={model} />
          <p role="status" style={{ ...hint, color: "var(--ink)" }}>
            Pronto ({(glb.size / 1024).toFixed(0)} KB). Tem esqueleto: anda no jogo.
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
          {glbUrl && (
            <a href={glbUrl} download="personagem.glb" style={{ ...hint, textDecoration: "underline" }}>
              Baixar o .glb
            </a>
          )}
        </>
      )}
    </>
  );
}
