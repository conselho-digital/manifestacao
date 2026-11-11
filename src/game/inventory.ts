// Inventário e loja: o que o jogador tem (armas) e o que pode comprar. Fica salvo neste navegador, por conta.

/** Índices de arma, os mesmos do Combat: 0 AK-47, 1 punho, 2 bandeira, 3 pistola, 4 placa, 5 taco de críquete, 6 taco de beisebol, 7 garrafa quebrada, 8 cano, 9 cutelo, 10 foice, 11 machado, 12 M4A1, 13 M16, 14 Honey Badger. */
export type WeaponId = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

export interface ShopItem {
  id: string;
  name: string;
  desc: string;
  price: number;
  kind: 'weapon' | 'ammo' | 'health' | 'armor';
  /** arma que ele dá (kind weapon) ou recarrega (ammo) */
  weapon?: WeaponId;
  /** munição que serve em várias armas (kind ammo): recarrega todas as que o jogador tem */
  weapons?: WeaponId[];
  /** quantidade de munição */
  amount?: number;
  /** imagem em public/hud */
  img?: string;
}

export const WEAPON_NAMES: Record<WeaponId, string> = { 0: 'AK-47', 1: 'Punho', 2: 'Bandeira', 3: 'Pistola', 4: 'Placa de trânsito', 5: 'Taco de críquete', 6: 'Taco de beisebol', 7: 'Garrafa quebrada', 8: 'Cano', 9: 'Cutelo', 10: 'Foice', 11: 'Machado', 12: 'M4A1', 13: 'M16', 14: 'Honey Badger' };
/** armas de fogo (têm munição, mira e recarga) */
export const GUN_IDS: WeaponId[] = [0, 3, 12, 13, 14];
export const isGunId = (w: WeaponId): boolean => GUN_IDS.includes(w);
/** nome curto usado no HUD e no nome do arquivo da imagem (public/hud/w-<chave>.png) */
export const HUD_KEY: Record<WeaponId, string> = { 0: 'ak', 1: 'fist', 2: 'bat', 3: 'pistol', 4: 'sign', 5: 'cricket', 6: 'baseball', 7: 'bottle', 8: 'pipe', 9: 'cleaver', 10: 'sickle', 11: 'axe', 12: 'm4', 13: 'm16', 14: 'hb' };
/** todas as armas, na ordem do menu */
export const ALL_WEAPONS: WeaponId[] = [1, 3, 0, 12, 13, 14, 2, 4, 5, 6, 7, 8, 9, 10, 11];
export const WEAPON_IMG: Partial<Record<WeaponId, string>> = { 0: '/hud/w-ak.png', 2: '/hud/w-bat.png', 3: '/hud/w-pistol.png', 4: '/hud/w-sign.png', 5: '/hud/w-cricket.png', 6: '/hud/w-baseball.png', 7: '/hud/w-bottle.png', 8: '/hud/w-pipe.png', 9: '/hud/w-cleaver.png', 10: '/hud/w-sickle.png', 11: '/hud/w-axe.png', 12: '/hud/w-m4.png', 13: '/hud/w-m16.png', 14: '/hud/w-hb.png' };

export const SHOP: ShopItem[] = [
  { id: 'w-pistol', name: 'Pistola', desc: '12 tiros por pente, 15 de dano. Vem com 60 balas.', price: 300, kind: 'weapon', weapon: 3, img: WEAPON_IMG[3] },
  { id: 'w-ak', name: 'AK-47', desc: 'Fuzil: 30 por pente, 20 de dano (40 na cabeça). Vem com 120 balas.', price: 800, kind: 'weapon', weapon: 0, img: WEAPON_IMG[0] },
  { id: 'w-m4', name: 'M4A1', desc: 'Fuzil: 30 por pente, 18 de dano (36 na cabeça), cadência alta. Vem com 120 balas.', price: 900, kind: 'weapon', weapon: 12, img: WEAPON_IMG[12] },
  { id: 'w-m16', name: 'M16', desc: 'Fuzil clássico do GTA 3: 30 por pente, 22 de dano. Vem com 120 balas.', price: 850, kind: 'weapon', weapon: 13, img: WEAPON_IMG[13] },
  { id: 'w-hb', name: 'Honey Badger', desc: 'Fuzil com silenciador: 30 por pente, 16 de dano, tiro baixo. Vem com 120 balas.', price: 1100, kind: 'weapon', weapon: 14, img: WEAPON_IMG[14] },
  { id: 'w-bat', name: 'Bandeira', desc: 'Rebatida de duas mãos, 30 de dano.', price: 150, kind: 'weapon', weapon: 2, img: WEAPON_IMG[2] },
  { id: 'w-sign', name: 'Placa de trânsito', desc: 'Corpo a corpo pesado, 30 de dano.', price: 100, kind: 'weapon', weapon: 4, img: WEAPON_IMG[4] },
  { id: 'w-cricket', name: 'Taco de críquete', desc: 'Taco de madeira (do jogo Bully): rebatida de duas mãos, 30 de dano.', price: 250, kind: 'weapon', weapon: 5, img: WEAPON_IMG[5] },
  { id: 'w-baseball', name: 'Taco de beisebol', desc: 'Taco de beisebol (do GTA SA): rebatida de duas mãos, 30 de dano.', price: 200, kind: 'weapon', weapon: 6, img: WEAPON_IMG[6] },
  { id: 'w-bottle', name: 'Garrafa quebrada', desc: 'Garrafa de vidro quebrada: corpo a corpo, 30 de dano.', price: 80, kind: 'weapon', weapon: 7, img: WEAPON_IMG[7] },
  { id: 'w-pipe', name: 'Cano', desc: 'Cano de metal: rebatida de duas mãos, 30 de dano.', price: 150, kind: 'weapon', weapon: 8, img: WEAPON_IMG[8] },
  { id: 'w-cleaver', name: 'Cutelo', desc: 'Cutelo de açougueiro: corpo a corpo, 30 de dano.', price: 220, kind: 'weapon', weapon: 9, img: WEAPON_IMG[9] },
  { id: 'w-sickle', name: 'Foice', desc: 'Foice de lâmina curva: corpo a corpo, 30 de dano.', price: 240, kind: 'weapon', weapon: 10, img: WEAPON_IMG[10] },
  { id: 'w-axe', name: 'Machado', desc: 'Machado de bombeiro: corpo a corpo, 30 de dano.', price: 350, kind: 'weapon', weapon: 11, img: WEAPON_IMG[11] },
  { id: 'a-pistol', name: 'Munição da pistola', desc: '+36 balas.', price: 60, kind: 'ammo', weapon: 3, amount: 36 },
  { id: 'a-ak', name: 'Munição do AK-47', desc: '+90 balas.', price: 100, kind: 'ammo', weapon: 0, amount: 90 },
  { id: 'a-556', name: 'Munição 5,56 (M4A1, M16, Honey Badger)', desc: '+90 balas em cada fuzil 5,56 que você tiver.', price: 100, kind: 'ammo', weapons: [12, 13, 14], amount: 90 },
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
        for (const w of raw.owned) if ((ALL_WEAPONS as number[]).includes(w)) this.owned.add(w);
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
