import Phaser from "phaser";
import { WORLD_HEIGHT } from "@manifestacao/shared";
import { AvenueScene } from "./scenes/AvenueScene.js";
import { pickAvatar } from "./ui/avatarPicker.js";

/**
 * Ponto de entrada do cliente (Fase 0).
 *
 * Mostra uma tela simples de escolha de time/apelido e então entra numa
 * avenida com um personagem controlável localmente (teclado + toque).
 * Ainda não há rede: o movimento é 100% local, como previsto na Fase 0.
 */
async function boot() {
  const avatar = await pickAvatar();

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game",
    backgroundColor: "#161a1f",
    pixelArt: false,
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    physics: {
      default: "arcade",
      arcade: { debug: false },
    },
    render: { antialias: true },
    fps: { target: 60 },
    scene: [new AvenueScene(avatar)],
  });

  // A câmera acompanha o jogador; a altura do mundo define o zoom base.
  game.scale.on("resize", () => {
    const scene = game.scene.getScene("avenue") as AvenueScene | null;
    scene?.fitCamera(WORLD_HEIGHT);
  });
}

void boot();
