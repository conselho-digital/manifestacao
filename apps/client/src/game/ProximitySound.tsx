import { useEffect, useRef } from "react";
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
export function useProximitySound(active: boolean) {
  const { camera } = useThree();
  const audioRef = useRef<PositionalAudio | null>(null);

  useEffect(() => {
    if (!active) return;

    let listener = camera.children.find(
      (c): c is AudioListener => c instanceof AudioListener,
    );
    if (!listener) {
      listener = new AudioListener();
      camera.add(listener);
    }

    const audio = new PositionalAudio(listener);
    audio.setRefDistance(4);
    audio.setMaxDistance(28);
    audio.setRolloffFactor(1.6);
    audio.setDistanceModel("inverse");
    audio.setVolume(0.5);

    const ctx = listener.context;
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.value = 196;
    osc.start();

    audio.setNodeSource(osc as unknown as AudioBufferSourceNode);
    audioRef.current = audio;

    return () => {
      osc.stop();
      osc.disconnect();
      audio.disconnect();
      audioRef.current = null;
    };
  }, [active, camera]);

  return audioRef;
}
