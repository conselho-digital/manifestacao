import { useState } from "react";
import {
  MAX_CHAT_LENGTH,
  TEAMS,
  TEAM_IDS,
  type ChatBroadcast,
  type TeamId,
} from "@manifestacao/shared";

interface HudProps {
  online: boolean;
  scores: Record<TeamId, number>;
  chatLog: ChatBroadcast[];
  onChat: (text: string) => void;
}

function hex(color: number): string {
  return "#" + color.toString(16).padStart(6, "0");
}

/** Sobreposição 2D: placar por time, estado da conexão e chat efêmero. */
export function Hud({ online, scores, chatLog, onChat }: HudProps) {
  const [text, setText] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onChat(text);
    setText("");
  };

  return (
    <>
      {/* Placar */}
      <div
        style={{
          position: "fixed",
          top: "calc(env(safe-area-inset-top, 0) + 10px)",
          left: 10,
          display: "flex",
          gap: 8,
          zIndex: 6,
        }}
      >
        {TEAM_IDS.map((id) => (
          <div
            key={id}
            style={{
              padding: "4px 10px",
              borderRadius: 8,
              background: "rgba(15,18,22,0.7)",
              borderLeft: `3px solid ${hex(TEAMS[id].color)}`,
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            {TEAMS[id].label}: {scores[id]}
          </div>
        ))}
        <div style={{ padding: "4px 10px", fontSize: 12, opacity: 0.6 }}>
          {online ? "online" : "offline"}
        </div>
      </div>

      {/* Chat */}
      <div
        style={{
          position: "fixed",
          left: 10,
          bottom: "calc(env(safe-area-inset-bottom, 0) + 10px)",
          width: "min(360px, 80vw)",
          zIndex: 6,
        }}
      >
        <div style={{ maxHeight: 140, overflow: "hidden", marginBottom: 6 }}>
          {chatLog.map((c, i) => (
            <div key={i} style={{ fontSize: 13, lineHeight: 1.4, textShadow: "0 1px 2px #000" }}>
              <strong style={{ color: hex(TEAMS[c.team].color) }}>{c.nickname}</strong>: {c.text}
            </div>
          ))}
        </div>
        <form onSubmit={submit}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={MAX_CHAT_LENGTH}
            placeholder="Conversar…"
            style={{
              width: "100%",
              padding: "8px 10px",
              fontSize: 14,
              borderRadius: 8,
              border: "1px solid #2b3139",
              background: "rgba(15,18,22,0.85)",
              color: "#f5f6f7",
            }}
          />
        </form>
      </div>
    </>
  );
}
