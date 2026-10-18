import Phaser from "phaser";
import {
  AVATAR_RADIUS,
  WALK_SPEED,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  clampToWorld,
  type AvatarConfig,
  type MoveInput,
} from "@manifestacao/shared";
import { TouchJoystick } from "../input/TouchJoystick.js";

/**
 * A avenida (Fase 0): cenário desenhado por código, um avatar controlável
 * localmente e a câmera seguindo o jogador. Sem rede ainda — serve para
 * validar movimento, enquadramento mobile e a base da cena.
 */
export class AvenueScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Container;
  private joystick!: TouchJoystick;
  private keys!: {
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
    w: Phaser.Input.Keyboard.Key;
    a: Phaser.Input.Keyboard.Key;
    s: Phaser.Input.Keyboard.Key;
    d: Phaser.Input.Keyboard.Key;
  };

  constructor(private readonly avatar: AvatarConfig) {
    super("avenue");
  }

  create(): void {
    this.drawAvenue();
    this.createPlayer();

    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.startFollow(this.player, true, 0.15, 0.15);
    this.fitCamera(WORLD_HEIGHT);

    this.joystick = new TouchJoystick(this);

    const kb = this.input.keyboard!;
    this.keys = {
      up: kb.addKey(Phaser.Input.Keyboard.KeyCodes.UP),
      down: kb.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN),
      left: kb.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
      right: kb.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
      w: kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      a: kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      s: kb.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      d: kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.joystick.destroy());
  }

  /** Ajusta o zoom para que a altura do mundo caiba na tela. */
  fitCamera(worldHeight: number): void {
    const zoom = this.scale.height / worldHeight;
    this.cameras.main.setZoom(Math.min(zoom, 1.4));
  }

  private drawAvenue(): void {
    // Calçada (fundo) e pista central, desenhadas com formas simples.
    const g = this.add.graphics();
    g.fillStyle(0x1f242b, 1).fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    g.fillStyle(0x2b3139, 1).fillRect(0, WORLD_HEIGHT * 0.3, WORLD_WIDTH, WORLD_HEIGHT * 0.4);

    // Faixa central tracejada.
    g.fillStyle(0xf1c40f, 0.8);
    const laneY = WORLD_HEIGHT * 0.5 - 3;
    for (let x = 0; x < WORLD_WIDTH; x += 80) {
      g.fillRect(x, laneY, 44, 6);
    }

    // Prédios estilizados nas duas bordas.
    for (let x = 40; x < WORLD_WIDTH; x += 220) {
      const h = 90 + ((x * 37) % 70);
      g.fillStyle(0x3a424c, 1).fillRect(x, WORLD_HEIGHT * 0.3 - h, 160, h);
      g.fillStyle(0x3a424c, 1).fillRect(x, WORLD_HEIGHT * 0.7, 160, h);
    }
  }

  private createPlayer(): void {
    const start = clampToWorld(WORLD_WIDTH / 2, WORLD_HEIGHT / 2);

    const body = this.add.circle(0, 0, AVATAR_RADIUS, this.avatar.shirt);
    body.setStrokeStyle(2, 0x0f1216, 0.6);

    const label = this.add
      .text(0, -AVATAR_RADIUS - 6, this.avatar.nickname, {
        fontFamily: "system-ui, sans-serif",
        fontSize: "13px",
        color: "#f5f6f7",
      })
      .setOrigin(0.5, 1);

    this.player = this.add.container(start.x, start.y, [body, label]);
  }

  private readInput(): MoveInput {
    const left = this.keys.left.isDown || this.keys.a.isDown;
    const right = this.keys.right.isDown || this.keys.d.isDown;
    const up = this.keys.up.isDown || this.keys.w.isDown;
    const down = this.keys.down.isDown || this.keys.s.isDown;

    let dx: -1 | 0 | 1 = 0;
    let dy: -1 | 0 | 1 = 0;
    if (left && !right) dx = -1;
    else if (right && !left) dx = 1;
    if (up && !down) dy = -1;
    else if (down && !up) dy = 1;

    if (dx === 0 && dy === 0) return this.joystick.getInput();
    return { dx, dy };
  }

  override update(_time: number, delta: number): void {
    const input = this.readInput();
    if (input.dx === 0 && input.dy === 0) return;

    // Normaliza diagonais para não andar mais rápido na diagonal.
    const len = Math.hypot(input.dx, input.dy) || 1;
    const step = (WALK_SPEED * delta) / 1000;
    const next = clampToWorld(
      this.player.x + (input.dx / len) * step,
      this.player.y + (input.dy / len) * step,
    );
    this.player.setPosition(next.x, next.y);
  }
}
