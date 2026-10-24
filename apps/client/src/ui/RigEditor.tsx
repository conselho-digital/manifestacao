import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  AmbientLight,
  Box3,
  GridHelper,
  Color,
  DirectionalLight,
  Group,
  Mesh,
  Object3D,
  OrthographicCamera,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import { RIG_POINTS, type RigKey, type RigMarks, type RigYaw, type Pt } from "../config/rigs.js";
import { bakeRig, instantiateRig, orientModel } from "../game/autoRig.js";
import { createAutoAnimator } from "../game/autoAnimate.js";

const COLORS: Record<RigKey, string> = {
  head: "#e599f7",
  neck: "#ffd43b",
  shoulder: "#4dabf7",
  elbow: "#339af0",
  hand: "#74c0fc",
  pelvis: "#ff922b",
  hip: "#51cf66",
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
  padding: "0 18px",
  borderRadius: "var(--r-lg)",
  border: "none",
  background: "var(--accent)",
  color: "var(--on-accent)",
  fontSize: "var(--t-body)",
  fontWeight: 800,
  cursor: "pointer",
};
/** Botão flutuante nos cantos da tela de edição. */
const corner: React.CSSProperties = {
  position: "absolute",
  minHeight: 44,
  padding: "0 14px",
  borderRadius: 22,
  border: "1px solid rgba(255,255,255,.25)",
  background: "rgba(20,24,30,.78)",
  color: "#fff",
  fontSize: "var(--t-ui)",
  fontWeight: 700,
  cursor: "pointer",
  zIndex: 5,
};

type Marks = Record<RigKey, Pt>;
const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

/** Chute inicial pelas proporções do modelo: o admin só arrasta o que estiver fora do lugar. */
function guessMarks(size: { x: number; y: number }): Marks {
  const H = size.y;
  const armX = Math.min((size.x / 2) * 0.95, 0.26 * H);
  const shoulder: Pt = [Math.min(0.17 * H, armX), 0.82 * H];
  const hand: Pt = [armX, 0.46 * H];
  const hip: Pt = [0.07 * H, 0.5 * H];
  const ankle: Pt = [0.07 * H, 0.05 * H];
  return {
    head: [0, 0.97 * H],
    neck: [0, 0.84 * H],
    shoulder,
    elbow: mid(shoulder, hand),
    hand,
    pelvis: [0, 0.52 * H],
    hip,
    knee: mid(hip, ankle),
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

/** Tamanho em pixels de um elemento, acompanhando redimensionamento (girar o celular, barra do navegador). */
function useBoxSize(ref: React.RefObject<HTMLElement>) {
  const [size, setSize] = useState({ w: 320, h: 420 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setSize({ w: Math.round(r.width), h: Math.round(r.height) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

/** Prévia 3D do boneco com o esqueleto automático, andando de um lado para o outro (ocupa o palco todo). */
function WalkTest({ scene, rig, w, h: vh }: { scene: Object3D; rig: RigMarks; w: number; h: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const camRef = useRef<PerspectiveCamera | null>(null);
  const rendererRef = useRef<WebGLRenderer | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let renderer: WebGLRenderer | null = null;
    let raf = 0;
    try {
      renderer = new WebGLRenderer({ canvas, antialias: true });
      rendererRef.current = renderer;
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
      const baked = bakeRig(scene, rig);
      const model = instantiateRig(baked);
      // O animador mede a velocidade pela posição do PAI do grupo: quem anda é o "avatar", como no jogo.
      const avatar = new Group();
      const frame = new Group();
      frame.add(model);
      avatar.add(frame);
      const world = new Scene();
      world.background = new Color(0x2a2f38);
      world.add(new AmbientLight(0xffffff, 1.7));
      const sun = new DirectionalLight(0xffffff, 1.6);
      sun.position.set(2, 4, 3);
      world.add(sun);
      world.add(avatar);
      avatar.updateWorldMatrix(true, true);
      const h = Math.max(0.5, new Box3().setFromObject(model).getSize(new Vector3()).y);
      // Chão quadriculado: sem ele, com a câmera seguindo o boneco não dá para sentir que ele anda.
      const grid = new GridHelper(h * 40, 80, 0x6b7280, 0x474d58);
      world.add(grid);
      const cam = new PerspectiveCamera(32, 1, 0.05, 200);
      camRef.current = cam;
      // Vista de lado, com a câmera acompanhando o boneco.
      cam.position.set(h * 2.9, h * 0.8, 0);
      cam.lookAt(0, h * 0.5, 0);
      const anim = createAutoAnimator(model, frame, []);
      const reach = h * 7;
      const speed = 4.2 * (h / 1.8); // a mesma velocidade de andar do jogo, em proporção ao tamanho do modelo
      let z = -reach;
      let dir = 1;
      let last = performance.now();
      const loop = (now: number) => {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        z += dir * speed * dt;
        if (z > reach) {
          z = reach;
          dir = -1;
        } else if (z < -reach) {
          z = -reach;
          dir = 1;
        }
        avatar.position.z = z;
        cam.position.z = z;
        cam.lookAt(0, h * 0.5, z);
        avatar.rotation.y = dir > 0 ? 0 : Math.PI;
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
        rendererRef.current = null;
        camRef.current = null;
      };
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao montar a prévia.");
      renderer?.dispose();
    }
  }, [scene, rig]);

  // Acompanha o tamanho do palco.
  useEffect(() => {
    rendererRef.current?.setSize(w, vh, false);
    if (camRef.current) {
      camRef.current.aspect = w / vh;
      camRef.current.updateProjectionMatrix();
    }
  }, [w, vh, scene, rig]);

  return (
    <>
      <canvas ref={ref} aria-label="Prévia andando" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }} />
      {error && (
        <p role="alert" style={{ position: "absolute", left: 12, right: 12, top: 60, margin: 0, color: "var(--danger)", fontSize: "var(--t-ui)" }}>
          {error}
        </p>
      )}
    </>
  );
}

/**
 * Editor de esqueleto em TELA CHEIA: o admin gira o modelo até ele olhar para a tela (frente), arrasta os pontos (de um
 * lado; o outro é espelhado) e alterna, pelo botão no canto, para ver o boneco andando. O jogo faz o resto.
 */
export function RigEditor({ scene, title, initial, busy, onSave, onSkip, onCancel }: Props) {
  const [yaw, setYaw] = useState<RigYaw>(initial?.yaw ?? 0);
  const oriented = useMemo(() => orientModel(scene, yaw), [scene, yaw]);
  useEffect(() => () => oriented.pieces.forEach((p) => p.geometry.dispose()), [oriented]);

  const [marks, setMarks] = useState<Marks>(() =>
    initial
      ? { head: initial.head, neck: initial.neck, shoulder: initial.shoulder, elbow: initial.elbow, hand: initial.hand, pelvis: initial.pelvis, hip: initial.hip, knee: initial.knee, ankle: initial.ankle, toe: initial.toe }
      : guessMarks(oriented.size),
  );
  const [touched, setTouched] = useState(Boolean(initial));
  const [selected, setSelected] = useState<RigKey>("neck");
  const [testing, setTesting] = useState(false);
  const [glError, setGlError] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const box = useBoxSize(boxRef);

  // Trava a rolagem da página por baixo enquanto o editor ocupa a tela.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Ao girar sem ter mexido nos pontos, refaz o chute (o modelo muda de largura/profundidade).
  useEffect(() => {
    if (!touched) setMarks(guessMarks(oriented.size));
  }, [oriented, touched]);

  // Enquadramento: vista frontal ortográfica com o modelo inteiro, na proporção do palco.
  const view = useMemo(() => {
    const aspect = box.w / box.h;
    let h = oriented.size.y * 1.22;
    let w = h * aspect;
    const needW = oriented.size.x * 1.22;
    if (needW > w) {
      w = needW;
      h = w / aspect;
    }
    return { w, h, cy: oriented.size.y / 2 };
  }, [oriented, box.w, box.h]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || testing) return;
    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ canvas, antialias: true });
    } catch {
      setGlError(true);
      return;
    }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.setSize(box.w, box.h, false);
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
  }, [oriented, view, box.w, box.h, testing]);

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

  // A coxa não é marcada: fica no meio entre quadril e joelho.
  const rig: RigMarks = useMemo(() => ({ yaw, ...marks, thigh: mid(marks.hip, marks.knee) }), [yaw, marks]);
  const lines: [Pt, Pt][] = [
    [marks.head, marks.neck],
    [marks.neck, marks.pelvis],
    [marks.shoulder, marks.elbow],
    [marks.elbow, marks.hand],
    [mirror(marks.shoulder), mirror(marks.elbow)],
    [mirror(marks.elbow), mirror(marks.hand)],
    [marks.hip, marks.knee],
    [marks.knee, marks.ankle],
    [marks.ankle, marks.toe],
    [mirror(marks.hip), mirror(marks.knee)],
    [mirror(marks.knee), mirror(marks.ankle)],
    [mirror(marks.ankle), mirror(marks.toe)],
    [marks.shoulder, mirror(marks.shoulder)],
  ];
  const svg = (p: Pt) => ({ x: (0.5 + p[0] / view.w) * 100, y: (0.5 - (p[1] - view.cy) / view.h) * 100 });
  const selectedPt = RIG_POINTS.find((p) => p.key === selected) ?? RIG_POINTS[0];

  return (
    <div
      role="dialog"
      aria-label={`Esqueleto: ${title}`}
      style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", flexDirection: "column", background: "var(--bg)", color: "var(--ink)" }}
    >
      <header style={{ padding: "max(10px, env(safe-area-inset-top)) 14px 8px", display: "flex", alignItems: "baseline", gap: 10, flexShrink: 0 }}>
        <h3 style={{ margin: 0, fontSize: "var(--t-body)", flex: "0 1 auto", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Esqueleto: {title}</h3>
        <span style={{ fontSize: "var(--t-ui)", color: "var(--ink-dim)" }}>{testing ? "Veja se a caminhada está natural." : "Gire até olhar para você e arraste os pontos."}</span>
      </header>

      {/* Palco: ocupa todo o espaço entre o topo e a barra de baixo */}
      <div ref={boxRef} style={{ position: "relative", flex: 1, minHeight: 0, touchAction: "none", overflow: "hidden" }}>
        {glError ? (
          <p role="alert" style={{ margin: 16, color: "var(--danger)", fontSize: "var(--t-ui)" }}>
            Este navegador não conseguiu abrir a prévia 3D.
          </p>
        ) : testing ? (
          <WalkTest scene={scene} rig={rig} w={box.w} h={box.h} />
        ) : (
          <>
            <canvas ref={canvasRef} aria-label="Vista frontal do modelo" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }} />
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
              {lines.map(([a, b], i) => (
                <line key={i} x1={svg(a).x} y1={svg(a).y} x2={svg(b).x} y2={svg(b).y} stroke="#fff" strokeOpacity={0.55} strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
              ))}
            </svg>
            {(["shoulder", "elbow", "hand", "hip", "knee", "ankle", "toe"] as RigKey[]).map((k) => (
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
                  width: 34,
                  height: 34,
                  marginLeft: -17,
                  marginTop: -17,
                  borderRadius: "50%",
                  border: `2px solid ${selected === pt.key ? "#fff" : "#000"}`,
                  background: COLORS[pt.key],
                  color: "#000",
                  fontSize: 14,
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
          </>
        )}

        {/* Botões nos cantos */}
        <button type="button" style={{ ...corner, top: 10, right: 10 }} onClick={() => setTesting((t) => !t)}>
          {testing ? "✏️ Editar pontos" : "🚶 Ver caminhada"}
        </button>
        {!testing && (
          <button type="button" style={{ ...corner, top: 10, left: 10 }} onClick={() => setYaw(((yaw + 90) % 360) as RigYaw)}>
            ↻ Girar
          </button>
        )}
        {!testing && (
          <button
            type="button"
            style={{ ...corner, bottom: 10, left: 10 }}
            onClick={() => {
              setTouched(false);
              setMarks(guessMarks(oriented.size));
            }}
          >
            Refazer chute
          </button>
        )}
        {!testing && (
          <span style={{ ...corner, bottom: 10, right: 10, pointerEvents: "none", display: "inline-flex", alignItems: "center", cursor: "default", maxWidth: "55%", fontWeight: 500 }}>
            <strong style={{ marginRight: 6 }}>{selectedPt.label}</strong>
            <span style={{ opacity: 0.8, fontSize: 12 }}>{selectedPt.help}</span>
          </span>
        )}
      </div>

      <footer style={{ flexShrink: 0, padding: "8px 14px max(10px, env(safe-area-inset-bottom))", display: "flex", flexDirection: "column", gap: 8 }}>
        {!testing && (
          <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
            {RIG_POINTS.map((pt, i) => (
              <button
                key={pt.key}
                type="button"
                onClick={() => setSelected(pt.key)}
                style={{ ...ghost, minHeight: 40, flexShrink: 0, display: "flex", gap: 6, alignItems: "center", padding: "4px 10px", borderColor: selected === pt.key ? "var(--accent)" : "var(--line)" }}
              >
                <span style={{ width: 20, height: 20, borderRadius: "50%", background: COLORS[pt.key], color: "#000", fontWeight: 800, fontSize: 12, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</span>
                {pt.label}
              </button>
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
          <button type="button" disabled={busy} onClick={() => onSave(rig)} style={{ ...primary, flex: 1 }}>
            Salvar esqueleto
          </button>
          {onSkip && (
            <button type="button" disabled={busy} onClick={onSkip} style={ghost}>
              Sem esqueleto
            </button>
          )}
          <button type="button" disabled={busy} onClick={onCancel} style={ghost}>
            Cancelar
          </button>
        </div>
      </footer>
    </div>
  );
}
