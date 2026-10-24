import { useEffect, useMemo, useRef, useState } from "react";
import {
  AmbientLight,
  Color,
  DirectionalLight,
  Group,
  Mesh,
  Object3D,
  OrthographicCamera,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from "three";
import { RIG_POINTS, type RigKey, type RigMarks, type RigYaw, type Pt } from "../config/rigs.js";
import { bakeRig, instantiateRig, orientModel } from "../game/autoRig.js";
import { createAutoAnimator } from "../game/autoAnimate.js";

const VIEW_W = 320;
const VIEW_H = 420;
const COLORS: Record<RigKey, string> = {
  head: "#e599f7",
  neck: "#ffd43b",
  shoulder: "#4dabf7",
  elbow: "#339af0",
  hand: "#74c0fc",
  pelvis: "#ff922b",
  hip: "#51cf66",
  thigh: "#40c057",
  knee: "#69db7c",
  ankle: "#8ce99a",
  toe: "#b2f2bb",
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

type Marks = Record<RigKey, Pt>;

/** Chute inicial pelas proporções do modelo: o admin só arrasta o que estiver fora do lugar. */
function guessMarks(size: { x: number; y: number }): Marks {
  const H = size.y;
  const armX = Math.min((size.x / 2) * 0.95, 0.26 * H);
  const shoulder: Pt = [Math.min(0.17 * H, armX), 0.82 * H];
  const hand: Pt = [armX, 0.46 * H];
  const hip: Pt = [0.07 * H, 0.5 * H];
  const ankle: Pt = [0.07 * H, 0.05 * H];
  const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const knee = mid(hip, ankle);
  return {
    head: [0, 0.97 * H],
    neck: [0, 0.84 * H],
    shoulder,
    elbow: mid(shoulder, hand),
    hand,
    pelvis: [0, 0.52 * H],
    hip,
    thigh: mid(hip, knee),
    knee,
    ankle,
    toe: [0.07 * H, 0.02 * H],
  };
}

interface Props {
  scene: Object3D;
  title: string;
  initial?: RigMarks | null;
  busy: boolean;
  onSave: (rig: RigMarks) => void;
  /** Envia sem esqueleto (o jogo usa só a animação do arquivo, se houver). */
  onSkip?: () => void;
  onCancel: () => void;
}

/** Prévia 3D do boneco com o esqueleto automático, andando de um lado para o outro. */
function WalkTest({ scene, rig }: { scene: Object3D; rig: RigMarks }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let renderer: WebGLRenderer | null = null;
    let raf = 0;
    try {
      renderer = new WebGLRenderer({ canvas, antialias: true });
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
      renderer.setSize(VIEW_W, 300, false);
      const baked = bakeRig(scene, rig);
      const model = instantiateRig(baked);
      const frame = new Group();
      frame.add(model);
      const world = new Scene();
      world.background = new Color(0x2a2f38);
      world.add(new AmbientLight(0xffffff, 1.7));
      const sun = new DirectionalLight(0xffffff, 1.6);
      sun.position.set(2, 4, 3);
      world.add(sun);
      world.add(frame);
      const h = Math.max(0.5, baked.pieces.reduce((m, p) => Math.max(m, p.geometry.boundingBox?.max.y ?? 0), 0));
      const cam = new PerspectiveCamera(32, VIEW_W / 300, 0.05, 100);
      cam.position.set(h * 1.6, h * 0.7, h * 2.4);
      cam.lookAt(0, h * 0.5, 0);
      const anim = createAutoAnimator(model, frame, []);
      let t = 0;
      let last = performance.now();
      const reach = h * 0.9;
      const speed = h * 1.4;
      const loop = (now: number) => {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        t += dt;
        // Onda triangular: anda a velocidade constante e volta.
        const period = (4 * reach) / speed;
        const ph = (t % period) / period;
        frame.position.z = (ph < 0.5 ? ph * 4 - 1 : 3 - ph * 4) * reach;
        frame.rotation.y = ph < 0.5 ? 0 : Math.PI;
        anim.update(dt, true);
        renderer!.render(world, cam);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
      return () => {
        cancelAnimationFrame(raf);
        anim.dispose();
        model.traverse((o) => ((o as { skeleton?: { dispose(): void } }).skeleton?.dispose()));
        for (const p of baked.pieces) p.geometry.dispose();
        renderer?.dispose();
      };
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao montar a prévia.");
      renderer?.dispose();
    }
  }, [scene, rig]);
  return (
    <>
      <canvas ref={ref} width={VIEW_W} height={300} aria-label="Prévia andando" style={{ width: VIEW_W, height: 300, maxWidth: "100%", borderRadius: 8 }} />
      {error && (
        <p role="alert" style={{ margin: 0, color: "var(--danger)", fontSize: "var(--t-ui)" }}>
          {error}
        </p>
      )}
    </>
  );
}

/**
 * Editor de esqueleto: o admin gira o modelo até ele olhar para a tela (frente), arrasta os 6 pontos (pescoço, pélvis,
 * ombro, mão, quadril, tornozelo — de um lado; o outro é espelhado) e testa a caminhada. O jogo faz o resto.
 */
export function RigEditor({ scene, title, initial, busy, onSave, onSkip, onCancel }: Props) {
  const [yaw, setYaw] = useState<RigYaw>(initial?.yaw ?? 0);
  const oriented = useMemo(() => orientModel(scene, yaw), [scene, yaw]);
  useEffect(() => () => oriented.pieces.forEach((p) => p.geometry.dispose()), [oriented]);

  const [marks, setMarks] = useState<Marks>(() =>
    initial
      ? { head: initial.head, neck: initial.neck, shoulder: initial.shoulder, elbow: initial.elbow, hand: initial.hand, pelvis: initial.pelvis, hip: initial.hip, thigh: initial.thigh, knee: initial.knee, ankle: initial.ankle, toe: initial.toe }
      : guessMarks(oriented.size),
  );
  const [touched, setTouched] = useState(Boolean(initial));
  const [selected, setSelected] = useState<RigKey>("neck");
  const [testing, setTesting] = useState(false);
  const [glError, setGlError] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  // Ao girar sem ter mexido nos pontos, refaz o chute (o modelo muda de largura/profundidade).
  useEffect(() => {
    if (!touched) setMarks(guessMarks(oriented.size));
  }, [oriented, touched]);

  // Enquadramento: vista frontal ortográfica com o modelo inteiro.
  const view = useMemo(() => {
    const h = oriented.size.y * 1.18;
    const w = (h * VIEW_W) / VIEW_H;
    const needW = oriented.size.x * 1.18;
    const scale = Math.max(1, needW / w);
    return { w: w * scale, h: h * scale, cy: oriented.size.y / 2 };
  }, [oriented]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ canvas, antialias: true });
    } catch {
      setGlError(true);
      return;
    }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.setSize(VIEW_W, VIEW_H, false);
    const world = new Scene();
    world.background = new Color(0x2a2f38);
    world.add(new AmbientLight(0xffffff, 2));
    const sun = new DirectionalLight(0xffffff, 1.5);
    sun.position.set(1, 2, 4);
    world.add(sun);
    const holder = new Group();
    for (const p of oriented.pieces) holder.add(new Mesh(p.geometry, p.material));
    world.add(holder);
    const cam = new OrthographicCamera(-view.w / 2, view.w / 2, view.cy + view.h / 2, view.cy - view.h / 2, 0.01, 1000);
    cam.position.set(0, 0, 50);
    renderer.render(world, cam);
    // Texturas que terminam de decodificar depois do primeiro quadro.
    const t = window.setTimeout(() => renderer.render(world, cam), 250);
    return () => {
      window.clearTimeout(t);
      renderer.dispose();
    };
  }, [oriented, view]);

  const toPct = (p: Pt) => ({ left: `${(0.5 + p[0] / view.w) * 100}%`, top: `${(0.5 - (p[1] - view.cy) / view.h) * 100}%` });
  const cx = (marks.neck[0] + marks.pelvis[0]) / 2;
  const mirror = (p: Pt): Pt => [2 * cx - p[0], p[1]];

  const setPoint = (key: RigKey, p: Pt) => {
    setTouched(true);
    setMarks((m) => ({ ...m, [key]: p }));
  };
  const fromEvent = (e: { clientX: number; clientY: number }): Pt | null => {
    const r = boxRef.current?.getBoundingClientRect();
    if (!r || r.width === 0) return null;
    const fx = (e.clientX - r.left) / r.width;
    const fy = (e.clientY - r.top) / r.height;
    return [(Math.min(1, Math.max(0, fx)) - 0.5) * view.w, view.cy + (0.5 - Math.min(1, Math.max(0, fy))) * view.h];
  };

  const rig: RigMarks = { yaw, ...marks };
  const lines: [Pt, Pt][] = [
    [marks.head, marks.neck],
    [marks.neck, marks.pelvis],
    [marks.shoulder, marks.elbow],
    [marks.elbow, marks.hand],
    [mirror(marks.shoulder), mirror(marks.elbow)],
    [mirror(marks.elbow), mirror(marks.hand)],
    [marks.hip, marks.thigh],
    [marks.thigh, marks.knee],
    [marks.knee, marks.ankle],
    [marks.ankle, marks.toe],
    [mirror(marks.hip), mirror(marks.thigh)],
    [mirror(marks.thigh), mirror(marks.knee)],
    [mirror(marks.knee), mirror(marks.ankle)],
    [mirror(marks.ankle), mirror(marks.toe)],
    [marks.shoulder, mirror(marks.shoulder)],
  ];
  const svg = (p: Pt) => ({ x: (0.5 + p[0] / view.w) * 100, y: (0.5 - (p[1] - view.cy) / view.h) * 100 });

  return (
    <>
      <h3 style={{ margin: "10px 0 0", fontSize: "var(--t-body)" }}>Esqueleto: {title}</h3>
      <p style={hint}>
        1) Gire o modelo até o personagem olhar para você (a frente). 2) Arraste os pontos para o lugar certo (marque um lado só, o outro é
        espelhado). 3) Teste a caminhada. O jogo cria os movimentos de braços e pernas sozinho.
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" style={ghost} onClick={() => setYaw(((yaw + 90) % 360) as RigYaw)}>
          ↻ Girar o modelo
        </button>
        <button
          type="button"
          style={ghost}
          onClick={() => {
            setTouched(false);
            setMarks(guessMarks(oriented.size));
          }}
        >
          Refazer chute
        </button>
      </div>

      {glError ? (
        <p role="alert" style={{ margin: 0, color: "var(--danger)", fontSize: "var(--t-ui)" }}>
          Este navegador não conseguiu abrir a prévia 3D.
        </p>
      ) : (
        <div ref={boxRef} style={{ position: "relative", width: VIEW_W, maxWidth: "100%", aspectRatio: `${VIEW_W} / ${VIEW_H}`, touchAction: "none", alignSelf: "flex-start" }}>
          <canvas ref={canvasRef} width={VIEW_W} height={VIEW_H} aria-label="Vista frontal do modelo" style={{ width: "100%", height: "100%", borderRadius: 8, display: "block" }} />
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
            {lines.map(([a, b], i) => (
              <line key={i} x1={svg(a).x} y1={svg(a).y} x2={svg(b).x} y2={svg(b).y} stroke="#fff" strokeOpacity={0.55} strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
            ))}
          </svg>
          {(["shoulder", "elbow", "hand", "hip", "thigh", "knee", "ankle", "toe"] as RigKey[]).map((k) => (
            <span
              key={`m-${k}`}
              aria-hidden="true"
              style={{ position: "absolute", ...toPct(mirror(marks[k])), width: 14, height: 14, marginLeft: -7, marginTop: -7, borderRadius: "50%", border: `2px dashed ${COLORS[k]}`, pointerEvents: "none" }}
            />
          ))}
          {RIG_POINTS.map((pt, i) => (
            <button
              key={pt.key}
              type="button"
              aria-label={`${pt.label}: arraste (ou use as setas)`}
              onPointerDown={(e) => {
                e.preventDefault();
                e.currentTarget.setPointerCapture(e.pointerId);
                setSelected(pt.key);
              }}
              onPointerMove={(e) => {
                if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
                const p = fromEvent(e);
                if (p) setPoint(pt.key, p);
              }}
              onFocus={() => setSelected(pt.key)}
              onKeyDown={(e) => {
                const step = e.shiftKey ? 0.05 : 0.01;
                const d: Record<string, Pt> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
                const v = d[e.key];
                if (!v) return;
                e.preventDefault();
                setPoint(pt.key, [marks[pt.key][0] + v[0], marks[pt.key][1] + v[1]]);
              }}
              style={{
                position: "absolute",
                ...toPct(marks[pt.key]),
                width: 28,
                height: 28,
                marginLeft: -14,
                marginTop: -14,
                borderRadius: "50%",
                border: `2px solid ${selected === pt.key ? "#fff" : "#000"}`,
                background: COLORS[pt.key],
                color: "#000",
                fontSize: 13,
                fontWeight: 800,
                padding: 0,
                cursor: "grab",
                touchAction: "none",
                zIndex: selected === pt.key ? 2 : 1,
              }}
            >
              {i + 1}
            </button>
          ))}
        </div>
      )}

      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
        {RIG_POINTS.map((pt, i) => (
          <li key={pt.key}>
            <button
              type="button"
              onClick={() => setSelected(pt.key)}
              style={{ ...ghost, width: "100%", minHeight: 40, textAlign: "left", display: "flex", gap: 8, alignItems: "center", borderColor: selected === pt.key ? "var(--accent)" : "var(--line)" }}
            >
              <span style={{ width: 22, height: 22, borderRadius: "50%", background: COLORS[pt.key], color: "#000", fontWeight: 800, fontSize: 12, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {i + 1}
              </span>
              <span>
                <strong>{pt.label}</strong> <span style={{ color: "var(--ink-dim)" }}>{pt.help}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      <button type="button" style={ghost} onClick={() => setTesting((t) => !t)}>
        {testing ? "Esconder a prévia" : "Testar a caminhada"}
      </button>
      {testing && <WalkTest scene={scene} rig={rig} />}

      <button type="button" disabled={busy} onClick={() => onSave(rig)} style={primary}>
        Salvar esqueleto
      </button>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {onSkip && (
          <button type="button" disabled={busy} onClick={onSkip} style={ghost}>
            Enviar sem esqueleto
          </button>
        )}
        <button type="button" disabled={busy} onClick={onCancel} style={ghost}>
          Cancelar
        </button>
      </div>
    </>
  );
}
