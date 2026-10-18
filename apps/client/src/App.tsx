import { useState } from "react";
import type { AvatarConfig } from "@manifestacao/shared";
import { AvatarPicker } from "./ui/AvatarPicker.js";
import { Game } from "./game/Game.js";

/** Portão de entrada: escolhe o avatar e então entra na avenida. */
export function App() {
  const [avatar, setAvatar] = useState<AvatarConfig | null>(null);
  return avatar ? <Game avatar={avatar} /> : <AvatarPicker onReady={setAvatar} />;
}
