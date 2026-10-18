import { useEffect, useState } from "react";

let unlockedGlobally = false;

/**
 * true após o primeiro toque/clique na página. Os navegadores só deixam o
 * AudioContext tocar depois de um gesto do usuário; este hook captura esse
 * momento uma única vez para toda a aplicação (não depende de um elemento
 * 3D específico receber o evento).
 */
export function useUserGestureUnlocked(): boolean {
  const [unlocked, setUnlocked] = useState(unlockedGlobally);

  useEffect(() => {
    if (unlockedGlobally) return;
    const onGesture = () => {
      unlockedGlobally = true;
      setUnlocked(true);
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("keydown", onGesture);
    };
    window.addEventListener("pointerdown", onGesture, { once: true });
    window.addEventListener("keydown", onGesture, { once: true });
    return () => {
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("keydown", onGesture);
    };
  }, []);

  return unlocked;
}
