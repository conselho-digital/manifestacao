import Phaser from "phaser";
import type { MoveInput } from "@manifestacao/shared";

/**
 * Joystick virtual simples para celular. Aparece onde o dedo toca na metade
 * inferior da tela e reporta uma direção em 8 sentidos (dx/dy em -1,0,1).
 * Em telas com teclado o jogador pode ignorar e usar WASD/setas.
 */
export class TouchJoystick {
  private readonly base: Phaser.GameObjects.Arc;
  private readonly knob: Phaser.GameObjects.Arc;
  private pointerId: number | null = null;
  private origin = new Phaser.Math.Vector2();
  private current = new Phaser.Math.Vector2();
  private readonly maxRadius = 56;
  private readonly deadzone = 12;

  constructor(private readonly scene: Phaser.Scene) {
    this.base = scene.add.circle(0, 0, this.maxRadius, 0xffffff, 0.08).setScrollFactor(0).setDepth(1000).setVisible(false);
    this.knob = scene.add.circle(0, 0, 22, 0xffffff, 0.35).setScrollFactor(0).setDepth(1001).setVisible(false);

    scene.input.addPointer(2);
    scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.onDown, this);
    scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.onMove, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP, this.onUp, this);
  }

  private onDown(pointer: Phaser.Input.Pointer): void {
    if (this.pointerId !== null) return;
    this.pointerId = pointer.id;
    this.origin.set(pointer.x, pointer.y);
    this.current.copy(this.origin);
    this.base.setPosition(pointer.x, pointer.y).setVisible(true);
    this.knob.setPosition(pointer.x, pointer.y).setVisible(true);
  }

  private onMove(pointer: Phaser.Input.Pointer): void {
    if (pointer.id !== this.pointerId) return;
    const dx = pointer.x - this.origin.x;
    const dy = pointer.y - this.origin.y;
    const dist = Math.min(Math.hypot(dx, dy), this.maxRadius);
    const angle = Math.atan2(dy, dx);
    this.current.set(this.origin.x + Math.cos(angle) * dist, this.origin.y + Math.sin(angle) * dist);
    this.knob.setPosition(this.current.x, this.current.y);
  }

  private onUp(pointer: Phaser.Input.Pointer): void {
    if (pointer.id !== this.pointerId) return;
    this.pointerId = null;
    this.base.setVisible(false);
    this.knob.setVisible(false);
  }

  /** Direção atual do joystick (0,0 quando inativo). */
  getInput(): MoveInput {
    if (this.pointerId === null) return { dx: 0, dy: 0 };
    const dx = this.current.x - this.origin.x;
    const dy = this.current.y - this.origin.y;
    if (Math.hypot(dx, dy) < this.deadzone) return { dx: 0, dy: 0 };
    return { dx: Math.sign(dx) as -1 | 0 | 1, dy: Math.sign(dy) as -1 | 0 | 1 };
  }

  destroy(): void {
    this.scene.input.off(Phaser.Input.Events.POINTER_DOWN, this.onDown, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_MOVE, this.onMove, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_UP, this.onUp, this);
    this.base.destroy();
    this.knob.destroy();
  }
}
