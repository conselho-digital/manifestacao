// Loja em reais (R$): preço e link de pagamento de cada arma/veículo ficam no Supabase (tabela `shop_prices`:
// todos leem, só o admin altera) e o que cada conta comprou em `purchases` (cada um lê só as suas linhas;
// quem grava é o servidor de pagamentos ou o admin pelo SQL — o navegador não grava compras).
import { supabase } from '../net/supabase';
import { SHOP, type Inventory, type ShopItem } from './inventory';

interface Row { price: number; url: string }
const rows = new Map<string, Row>();

export const isReal = (it: ShopItem): boolean => it.kind === 'weapon' || it.kind === 'vehicle';
/** itens vendidos por reais, na ordem da loja */
export const REAL_ITEMS: ShopItem[] = SHOP.filter(isReal);

/** Preço em reais (valor do banco, ou o padrão do código). */
export const priceOf = (it: ShopItem): number => rows.get(it.id)?.price ?? it.price;
/** Link de pagamento (Mercado Pago) deste item, ou '' se ainda não foi configurado. */
export const payUrlOf = (it: ShopItem): string => rows.get(it.id)?.url ?? '';
export const brl = (n: number): string => `R$ ${n.toFixed(2).replace('.', ',')}`;

/** Só abre links https (o admin cola o link; nada de javascript: ou outros esquemas). */
export const safeUrl = (u: string): string => {
  try { const x = new URL(u); return x.protocol === 'https:' ? x.href : ''; } catch { return ''; }
};

/** Baixa os preços e links. */
export async function loadPrices(): Promise<void> {
  if (!supabase) return;
  try {
    const { data, error } = await supabase.from('shop_prices').select('item_id,price_brl,pay_url');
    if (error || !data) return;
    rows.clear();
    for (const r of data) {
      const price = Number(r.price_brl);
      if (Number.isFinite(price) && price >= 0) rows.set(String(r.item_id), { price, url: typeof r.pay_url === 'string' ? safeUrl(r.pay_url) : '' });
    }
  } catch { /* offline: valem os preços padrão */ }
}

/** Baixa as compras desta conta e administrador (admin tem tudo). */
export async function loadPurchases(inv: Inventory, admin: boolean): Promise<void> {
  inv.admin = admin;
  if (!supabase) return;
  try {
    const { data, error } = await supabase.from('purchases').select('item_id');
    if (error || !data) return;
    inv.bought.clear();
    for (const r of data) inv.bought.add(String(r.item_id));
  } catch { /* offline */ }
}

/** Admin: grava o preço (e o link) de um item. Retorna a mensagem de erro, se houver. */
export async function savePrice(id: string, price: number, url: string): Promise<string | null> {
  if (!supabase) return 'Sem conexão com o servidor.';
  if (!Number.isFinite(price) || price < 0 || price > 9999) return 'Preço inválido (0 a 9999).';
  const clean = url.trim();
  if (clean && !safeUrl(clean)) return 'O link precisa começar com https://';
  const { data, error } = await supabase
    .from('shop_prices')
    .upsert({ item_id: id, price_brl: Math.round(price * 100) / 100, pay_url: clean || null, updated_at: new Date().toISOString() }, { onConflict: 'item_id' })
    .select('item_id');
  if (error) return /permission denied|row-level security|violates/i.test(error.message) ? 'Sem permissão: só o administrador altera os preços.' : error.message;
  if (!data || data.length === 0) return 'Sem permissão para alterar (só o administrador).';
  await loadPrices();
  return null;
}
