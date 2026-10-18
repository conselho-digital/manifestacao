import { useEffect, useState } from "react";
import { AudioListener, PositionalAudio } from "three";
import { useThree } from "@react-three/fiber";

/**
 * Som ambiente por proximidade: um PositionalAudio preso ao avatar quando ele
 * está no carro de som. O volume cai com a distância (Three.js), então só
 * quem está perto ouve — como o "caixa de som" descrito no CLAUDE.md §3.
 *
 * O som é sintetizado por WebAudio (oscilador simples), sem depender de um
 * arquivo de música de terceiros — evita qualquer questão de licença de
 * áudio enquanto não entra uma trilha própria (ver CREDITS.md).
 */
export function useProximitySound(active: boolean): PositionalAudio | null {
  const { camera } = useThree();
  // useState (não useRef): precisamos que a criação do áudio dispare
  // re-render, senão o <primitive> nunca chega a montar na árvore de cena.
  const [audio, setAudio] = useState<PositionalAudio | null>(null);

  useEffect(() => {
    if (!active) {
      setAudio(null);
      return;
    }

    let listener = camera.children.find(
      (c): c is AudioListener => c instanceof AudioListener,
    );
    if (!listener) {
      listener = new AudioListener();
      camera.add(listener);
    }

    const ctx = listener.context;
    // Navegadores exigem o AudioContext "resumido" após o gesto do usuário;
    // ele pode nascer suspenso mesmo dentro do handler de gesto.
    if (ctx.state === "suspended") void ctx.resume();

    const instance = new PositionalAudio(listener);
    instance.setRefDistance(4);
    instance.setMaxDistance(28);
    instance.setRolloffFactor(1.6);
    instance.setDistanceModel("inverse");
    instance.setVolume(0.5);

    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.value = 196;
    osc.start();

    instance.setNodeSource(osc as unknown as AudioBufferSourceNode);
    setAudio(instance);

    return () => {
      osc.stop();
      osc.disconnect();
      instance.disconnect();
      setAudio(null);
    };
  }, [active, camera]);

  return audio;
}
