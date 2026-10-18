import {
  MAX_NICKNAME_LENGTH,
  TEAMS,
  TEAM_IDS,
  isTeamId,
  type AvatarConfig,
  type TeamId,
} from "@manifestacao/shared";

const STORAGE_KEY = "manifestacao.avatar";

function loadSaved(): Partial<AvatarConfig> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<AvatarConfig>) : {};
  } catch {
    return {};
  }
}

function save(avatar: AvatarConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(avatar));
  } catch {
    // localStorage pode falhar (modo privado); seguimos sem persistir.
  }
}

function hex(color: number): string {
  return "#" + color.toString(16).padStart(6, "0");
}

/**
 * Tela de entrada em 1 clique: escolher time e apelido. Resolve com o
 * AvatarConfig escolhido. Toda a UI é DOM (leve no celular); o jogo em si
 * é Phaser.
 */
export function pickAvatar(): Promise<AvatarConfig> {
  const saved = loadSaved();
  let team: TeamId = isTeamId(saved.team) ? saved.team : TEAM_IDS[0];

  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-label", "Escolha o seu lado");
    overlay.style.cssText = [
      "position:fixed",
      "inset:0",
      "display:flex",
      "flex-direction:column",
      "align-items:center",
      "justify-content:center",
      "gap:20px",
      "padding:24px",
      "background:#161a1f",
      "color:#f5f6f7",
      "z-index:10",
      "text-align:center",
    ].join(";");

    const title = document.createElement("h1");
    title.textContent = "Entre na avenida";
    title.style.cssText = "margin:0;font-size:28px;font-weight:800";

    const subtitle = document.createElement("p");
    subtitle.textContent = "Escolha o seu lado e o seu apelido.";
    subtitle.style.cssText = "margin:0;opacity:.75;font-size:15px";

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.maxLength = MAX_NICKNAME_LENGTH;
    nameInput.placeholder = "Seu apelido";
    nameInput.value = saved.nickname ?? "";
    nameInput.style.cssText = [
      "width:min(320px,80vw)",
      "padding:12px 14px",
      "font-size:16px",
      "border-radius:10px",
      "border:1px solid #2b3139",
      "background:#0f1216",
      "color:#f5f6f7",
    ].join(";");

    const teamRow = document.createElement("div");
    teamRow.style.cssText = "display:flex;gap:10px;flex-wrap:wrap;justify-content:center";

    function renderTeams() {
      teamRow.replaceChildren();
      for (const id of TEAM_IDS) {
        const t = TEAMS[id];
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = t.label;
        const selected = id === team;
        btn.style.cssText = [
          "min-width:96px",
          "padding:12px 16px",
          "font-size:15px",
          "font-weight:700",
          "border-radius:10px",
          "cursor:pointer",
          `border:2px solid ${hex(t.color)}`,
          selected ? `background:${hex(t.color)};color:#0f1216` : "background:transparent;color:#f5f6f7",
        ].join(";");
        btn.addEventListener("click", () => {
          team = id;
          renderTeams();
        });
        teamRow.appendChild(btn);
      }
    }
    renderTeams();

    const enter = document.createElement("button");
    enter.type = "button";
    enter.textContent = "Entrar";
    enter.style.cssText = [
      "margin-top:4px",
      "padding:14px 32px",
      "font-size:17px",
      "font-weight:800",
      "border-radius:12px",
      "border:none",
      "cursor:pointer",
      "background:#f5f6f7",
      "color:#0f1216",
    ].join(";");

    function submit() {
      const nickname = nameInput.value.trim().slice(0, MAX_NICKNAME_LENGTH) || "Anônimo";
      const avatar: AvatarConfig = { team, nickname, shirt: TEAMS[team].color };
      save(avatar);
      overlay.remove();
      resolve(avatar);
    }

    enter.addEventListener("click", submit);
    nameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") submit();
    });

    overlay.append(title, subtitle, nameInput, teamRow, enter);
    document.body.appendChild(overlay);
    nameInput.focus();
  });
}
