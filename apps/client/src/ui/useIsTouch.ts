import { useEffect, useState } from "react";

const QUERY = "(hover: none) and (pointer: coarse)";

/**
 * true em dispositivos cujo ponteiro principal é o toque (celular/tablet).
 * Em PC (mouse) fica false — usado pra esconder joystick e botões de toque.
 */
export function useIsTouch(): boolean {
  const [touch, setTouch] = useState(() => window.matchMedia(QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const onChange = () => setTouch(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return touch;
}
