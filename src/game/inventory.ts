// Inventário e loja: o que o jogador tem (armas) e o que pode comprar. Fica salvo neste navegador, por conta.

/** Índices de arma, os mesmos do Combat: 0 AK-47, 1 punho, 2 bandeira, 3 pistola, 4 placa, 5 taco de críquete, 6 taco de beisebol. */
export type WeaponId = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface ShopItem {
  id: string;
  name: string;
  desc: string;
  price: number;
  kind: 'weapon' | 'ammo' | 'health' | 'armor';
  /** arma que ele dá (kind weapon) ou recarrega (ammo) */
  weapon?: WeaponId;
  /** quantidade de munição */
  amount?: number;
  /** imagem em public/hud */
  img?: string;
}

export const WEAPON_NAMES: Record<WeaponId, string> = { 0: 'AK-47', 1: 'Punho', 2: 'Bandeira', 3: 'Pistola', 4: 'Placa de trânsito', 5: 'Taco de críquete', 6: 'Taco de beisebol' };
export const WEAPON_IMG: Partial<Record<WeaponId, string>> = { 0: '/hud/w-ak.png', 2: '/hud/w-bat.png', 3: '/hud/w-pistol.png', 4: '/hud/w-sign.png', 5: '/hud/w-cricket.png', 6: '/hud/w-baseball.png' };

export const SHOP: ShopItem[] = [
  { id: 'w-pistol', name: 'Pistola', desc: '12 tiros por pente, 15 de dano. Vem com 60 balas.', price: 300, kind: 'weapon', weapon: 3, img: WEAPON_IMG[3] },
  { id: 'w-ak', name: 'AK-47', desc: 'Fuzil: 30 por pente, 20 de dano (40 na cabeça). Vem com 120 balas.', price: 800, kind: 'weapon', weapon: 0, img: WEAPON_IMG[0] },
  { id: 'w-bat', name: 'Bandeira', desc: 'Rebatida de duas mãos, 30 de dano.', price: 150, kind: 'weapon', weapon: 2, img: WEAPON_IMG[2] },
  { id: 'w-sign', name: 'Placa de trânsito', desc: 'Corpo a corpo pesado, 30 de dano.', price: 100, kind: 'weapon', weapon: 4, img: WEAPON_IMG[4] },
  { id: 'w-cricket', name: 'Taco de críquete', desc: 'Taco de madeira (do jogo Bully): rebatida de duas mãos, 30 de dano.', price: 250, kind: 'weapon', weapon: 5, img: WEAPON_IMG[5] },
  { id: 'w-baseball', name: 'Taco de beisebol', desc: 'Taco de beisebol (do GTA SA): rebatida de duas mãos, 30 de dano.', price: 200, kind: 'weapon', weapon: 6, img: WEAPON_IMG[6] },
  { id: 'a-pistol', name: 'Munição da pistola', desc: '+36 balas.', price: 60, kind: 'ammo', weapon: 3, amount: 36 },
  { id: 'a-ak', name: 'Munição do AK-47', desc: '+90 balas.', price: 100, kind: 'ammo', weapon: 0, amount: 90 },
  { id: 'health', name: 'Kit médico', desc: 'Recupera toda a vida.', price: 100, kind: 'health' },
  { id: 'armor', name: 'Colete', desc: 'Recupera todo o colete (absorve 60% do dano).', price: 200, kind: 'armor' },
];

const START_MONEY = 1000;

interface Saved { money: number; owned: WeaponId[] }

export class Inventory {
  money = START_MONEY;
  /** armas que o jogador já tem (o punho é sempre dele) */
  readonly owned = new Set<WeaponId>([1]);
  private key = 'arena-inv:anon';

  /** Carrega o que esta conta já tinha. */
  load(userId: string): void {
    this.key = `arena-inv:${userId}`;
    try {
      const raw = JSON.parse(localStorage.getItem(this.key) ?? 'null') as Partial<Saved> | null;
      if (raw && typeof raw.money === 'number' && Number.isFinite(raw.money) && Array.isArray(raw.owned)) {
        this.money = Math.max(0, Math.min(1e9, Math.floor(raw.money)));
        this.owned.clear();
        this.owned.add(1);
        for (const w of raw.owned) if ([0, 1, 2, 3, 4, 5, 6].includes(w)) this.owned.add(w);
      }
    } catch { /* começa do zero */ }
  }

  save(): void {
    try { localStorage.setItem(this.key, JSON.stringify({ money: this.money, owned: [...this.owned] } satisfies Saved)); } catch { /* sem armazenamento */ }
  }

  has(w: WeaponId): boolean { return this.owned.has(w); }

  earn(n: number): void { this.money += n; this.save(); }

  /** Gasta o dinheiro se der; retorna false se faltar. */
  spend(n: number): boolean {
    if (this.money < n) return false;
    this.money -= n;
    this.save();
    return true;
  }

  grant(w: WeaponId): void { this.owned.add(w); this.save(); }
}
