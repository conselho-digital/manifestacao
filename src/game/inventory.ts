// Inventário e loja: o que o jogador tem (armas) e o que pode comprar. Fica salvo neste navegador, por conta.

/** Índices de arma, os mesmos do Combat: 0 AK-47, 1 punho, 2 bandeira, 3 pistola, 4 placa, 5 taco de críquete, 6 taco de beisebol, 7 garrafa quebrada, 8 cano, 9 cutelo, 10 foice, 11 machado, 12 M4A1, 13 M16, 14 Honey Badger, 15 lata de spray. */
export type WeaponId = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16;

export interface ShopItem {
  id: string;
  name: string;
  desc: string;
  price: number;
  /** weapon e vehicle custam reais (R$, preço editável pelo admin); o resto usa o dinheiro do jogo ($) */
  kind: 'weapon' | 'ammo' | 'health' | 'armor' | 'vehicle';
  /** modelo do veículo (kind vehicle) */
  model?: string;
  /** arma que ele dá (kind weapon) ou recarrega (ammo) */
  weapon?: WeaponId;
  /** munição que serve em várias armas (kind ammo): recarrega todas as que o jogador tem */
  weapons?: WeaponId[];
  /** quantidade de munição */
  amount?: number;
  /** imagem em public/hud */
  img?: string;
}

export const WEAPON_NAMES: Record<WeaponId, string> = { 0: 'AK-47', 1: 'Punho', 2: 'Bandeira', 3: 'Pistola', 4: 'Placa de trânsito', 5: 'Taco de críquete', 6: 'Taco de beisebol', 7: 'Garrafa quebrada', 8: 'Cano', 9: 'Cutelo', 10: 'Foice', 11: 'Machado', 12: 'M4A1', 13: 'M16', 14: 'Honey Badger', 15: 'Lata de spray', 16: 'Faca' };
/** armas de fogo (têm munição, mira e recarga) */
export const GUN_IDS: WeaponId[] = [0, 3, 12, 13, 14];
export const isGunId = (w: WeaponId): boolean => GUN_IDS.includes(w);
/** nome curto usado no HUD e no nome do arquivo da imagem (public/hud/w-<chave>.png) */
export const HUD_KEY: Record<WeaponId, string> = { 0: 'ak', 1: 'fist', 2: 'bat', 3: 'pistol', 4: 'sign', 5: 'cricket', 6: 'baseball', 7: 'bottle', 8: 'pipe', 9: 'cleaver', 10: 'sickle', 11: 'axe', 12: 'm4', 13: 'm16', 14: 'hb', 15: 'spray', 16: 'knife' };
/** todas as armas, na ordem do menu */
export const ALL_WEAPONS: WeaponId[] = [1, 3, 0, 12, 13, 14, 2, 4, 5, 6, 7, 8, 9, 10, 11, 15];
export const WEAPON_IMG: Partial<Record<WeaponId, string>> = { 0: '/hud/w-ak.png', 2: '/hud/w-bat.png', 3: '/hud/w-pistol.png', 4: '/hud/w-sign.png', 5: '/hud/w-cricket.png', 6: '/hud/w-baseball.png', 7: '/hud/w-bottle.png', 8: '/hud/w-pipe.png', 9: '/hud/w-cleaver.png', 10: '/hud/w-sickle.png', 11: '/hud/w-axe.png', 12: '/hud/w-m4.png', 13: '/hud/w-m16.png', 14: '/hud/w-hb.png', 15: '/hud/w-spray.png', 16: '/hud/w-knife.png' };

export const SHOP: ShopItem[] = [
  { id: 'w-pistol', name: 'Pistola', desc: '12 tiros por pente, 15 de dano. Vem com 60 balas.', price: 15, kind: 'weapon', weapon: 3, img: WEAPON_IMG[3] },
  { id: 'w-ak', name: 'AK-47', desc: 'Fuzil: 30 por pente, 20 de dano (40 na cabeça). Vem com 120 balas.', price: 15, kind: 'weapon', weapon: 0, img: WEAPON_IMG[0] },
  { id: 'w-m4', name: 'M4A1', desc: 'Fuzil: 30 por pente, 18 de dano (36 na cabeça), cadência alta. Vem com 120 balas.', price: 15, kind: 'weapon', weapon: 12, img: WEAPON_IMG[12] },
  { id: 'w-m16', name: 'M16', desc: 'Fuzil clássico do GTA 3: 30 por pente, 22 de dano. Vem com 120 balas.', price: 15, kind: 'weapon', weapon: 13, img: WEAPON_IMG[13] },
  { id: 'w-hb', name: 'Honey Badger', desc: 'Fuzil com silenciador: 30 por pente, 16 de dano, tiro baixo. Vem com 120 balas.', price: 15, kind: 'weapon', weapon: 14, img: WEAPON_IMG[14] },
  { id: 'w-bat', name: 'Bandeira', desc: 'Rebatida de duas mãos, 30 de dano.', price: 5, kind: 'weapon', weapon: 2, img: WEAPON_IMG[2] },
  { id: 'w-sign', name: 'Placa de trânsito', desc: 'Corpo a corpo pesado, 30 de dano.', price: 5, kind: 'weapon', weapon: 4, img: WEAPON_IMG[4] },
  { id: 'w-cricket', name: 'Taco de críquete', desc: 'Taco de madeira (do jogo Bully): rebatida de duas mãos, 30 de dano.', price: 5, kind: 'weapon', weapon: 5, img: WEAPON_IMG[5] },
  { id: 'w-baseball', name: 'Taco de beisebol', desc: 'Taco de beisebol (do GTA SA): rebatida de duas mãos, 30 de dano.', price: 5, kind: 'weapon', weapon: 6, img: WEAPON_IMG[6] },
  { id: 'w-bottle', name: 'Garrafa quebrada', desc: 'Garrafa de vidro quebrada: corpo a corpo, 30 de dano.', price: 5, kind: 'weapon', weapon: 7, img: WEAPON_IMG[7] },
  { id: 'w-pipe', name: 'Cano', desc: 'Cano de metal: rebatida de duas mãos, 30 de dano.', price: 5, kind: 'weapon', weapon: 8, img: WEAPON_IMG[8] },
  { id: 'w-cleaver', name: 'Cutelo', desc: 'Cutelo de açougueiro: corpo a corpo, 30 de dano.', price: 5, kind: 'weapon', weapon: 9, img: WEAPON_IMG[9] },
  { id: 'w-sickle', name: 'Foice', desc: 'Foice de lâmina curva: corpo a corpo, 30 de dano.', price: 5, kind: 'weapon', weapon: 10, img: WEAPON_IMG[10] },
  { id: 'w-axe', name: 'Machado', desc: 'Machado de bombeiro: corpo a corpo, 30 de dano.', price: 5, kind: 'weapon', weapon: 11, img: WEAPON_IMG[11] },
  { id: 'w-knife', name: 'Faca', desc: 'Faca de mola: corpo a corpo, 30 de dano.', price: 5, kind: 'weapon', weapon: 16, img: WEAPON_IMG[16] },
  { id: 'w-spray', name: 'Lata de spray', desc: 'Pinta a imagem da sua equipe numa parede de prédio. Não causa dano.', price: 5, kind: 'weapon', weapon: 15, img: WEAPON_IMG[15] },
  { id: 'v-blistac', name: 'Blista', desc: 'Carro esportivo compacto.', price: 30, kind: 'vehicle', model: 'blistac', img: '/hud/v-blistac.png' },
  { id: 'v-buffalo', name: 'Buffalo', desc: 'Sedã esportivo potente.', price: 30, kind: 'vehicle', model: 'buffalo', img: '/hud/v-buffalo.png' },
  { id: 'v-clover', name: 'Clover', desc: 'Muscle car clássico.', price: 30, kind: 'vehicle', model: 'clover', img: '/hud/v-clover.png' },
  { id: 'v-harley', name: 'Harley', desc: 'Moto custom.', price: 30, kind: 'vehicle', model: 'harley', img: '/hud/v-harley.png' },
  { id: 'v-triumph', name: 'Triumph', desc: 'Moto clássica.', price: 30, kind: 'vehicle', model: 'triumph', img: '/hud/v-triumph.png' },
  { id: 'v-bmw', name: 'BMW S1000', desc: 'Moto esportiva.', price: 30, kind: 'vehicle', model: 'bmw', img: '/hud/v-bmw.png' },
  { id: 'v-suzuki', name: 'Suzuki GSX-R600', desc: 'Moto esportiva.', price: 30, kind: 'vehicle', model: 'suzuki', img: '/hud/v-suzuki.png' },
  { id: 'a-pistol', name: 'Munição da pistola', desc: '+36 balas.', price: 60, kind: 'ammo', weapon: 3, amount: 36 },
  { id: 'a-ak', name: 'Munição do AK-47', desc: '+90 balas.', price: 100, kind: 'ammo', weapon: 0, amount: 90 },
  { id: 'a-556', name: 'Munição 5,56 (M4A1, M16, Honey Badger)', desc: '+90 balas em cada fuzil 5,56 que você tiver.', price: 100, kind: 'ammo', weapons: [12, 13, 14], amount: 90 },
  { id: 'health', name: 'Kit médico', desc: 'Recupera toda a vida.', price: 100, kind: 'health' },
  { id: 'armor', name: 'Colete', desc: 'Recupera todo o colete (absorve 60% do dano).', price: 200, kind: 'armor' },
];

/** veículos que o jogador pode ter (a viatura é do mundo, não da garagem) */
export const GARAGE_ITEMS = SHOP.filter((i) => i.kind === 'vehicle');
/** id da loja da arma (para saber se foi comprada) */
export const shopIdOfWeapon = (w: WeaponId): string | null => SHOP.find((i) => i.kind === 'weapon' && i.weapon === w)?.id ?? null;

const START_MONEY = 1000;

interface Saved { money: number }

/**
 * O que o jogador tem. Armas e veículos vêm das compras da conta (tabela `purchases`, ver shop.ts);
 * o administrador tem tudo. O dinheiro do jogo ($: munição, vida, colete) fica salvo neste navegador.
 */
export class Inventory {
  money = START_MONEY;
  /** ids da loja comprados (armas e veículos) */
  readonly bought = new Set<string>();
  /** administrador: tem todas as armas e veículos */
  admin = false;
  private key = 'arena-inv:anon';

  /** Carrega o dinheiro que esta conta já tinha. */
  load(userId: string): void {
    this.key = `arena-inv:${userId}`;
    try {
      const raw = JSON.parse(localStorage.getItem(this.key) ?? 'null') as Partial<Saved> | null;
      if (raw && typeof raw.money === 'number' && Number.isFinite(raw.money)) this.money = Math.max(0, Math.min(1e9, Math.floor(raw.money)));
    } catch { /* começa do zero */ }
  }

  save(): void {
    try { localStorage.setItem(this.key, JSON.stringify({ money: this.money } satisfies Saved)); } catch { /* sem armazenamento */ }
  }

  /** tem a arma? (o punho é sempre dele) */
  has(w: WeaponId): boolean {
    if (w === 1 || this.admin) return true;
    const id = shopIdOfWeapon(w);
    return !!id && this.bought.has(id);
  }

  hasItem(id: string): boolean { return this.admin || this.bought.has(id); }

  hasVehicle(model: string): boolean {
    const it = GARAGE_ITEMS.find((i) => i.model === model);
    return !!it && this.hasItem(it.id);
  }

  earn(n: number): void { this.money += n; this.save(); }

  /** Gasta o dinheiro se der; retorna false se faltar. */
  spend(n: number): boolean {
    if (this.money < n) return false;
    this.money -= n;
    this.save();
    return true;
  }
}
