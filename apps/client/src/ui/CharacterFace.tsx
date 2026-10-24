import { useState } from "react";
import type { CharacterId } from "@manifestacao/shared";
import { AvatarGlyph } from "./AvatarGlyph.js";

/** Foto do rosto do personagem (public/faces); se faltar o arquivo, cai no ícone desenhado. */
export function CharacterFace({ color, character, size = 64 }: { color: string; character: CharacterId; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <AvatarGlyph color={color} character={character} size={size} />;
  return (
    <img
      src={`/faces/${character}.png`}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
      style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", border: `3px solid ${color}`, background: "var(--surface-2)" }}
    />
  );
}
