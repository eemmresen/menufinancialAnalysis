import type { Unit } from '@/types';

export type UnitFamily = 'mass' | 'volume' | 'count';

export const UNITS: Unit[] = ['kg', 'g', 'l', 'ml', 'adet', 'paket'];

export const UNIT_LABELS: Record<Unit, string> = {
  kg: 'kg',
  g: 'g',
  l: 'L',
  ml: 'ml',
  adet: 'adet',
  paket: 'paket',
};

export const UNIT_NAMES: Record<Unit, string> = {
  kg: 'Kilogram',
  g: 'Gram',
  l: 'Litre',
  ml: 'Mililitre',
  adet: 'Adet',
  paket: 'Paket',
};

export interface UnitContext {
  packageSize?: number;
  packageUnit?: Unit;
}

export class UnitError extends Error {}

export function unitFamily(unit: Unit): UnitFamily | 'package' {
  switch (unit) {
    case 'kg':
    case 'g':
      return 'mass';
    case 'l':
    case 'ml':
      return 'volume';
    case 'adet':
      return 'count';
    default:
      return 'package';
  }
}

/** Birimin kanonik taban birimi: g, ml veya adet. */
export function baseUnitOf(unit: Unit, ctx?: UnitContext): Unit {
  if (unit === 'paket') {
    if (!ctx?.packageUnit) return 'adet';
    return baseUnitOf(ctx.packageUnit, undefined);
  }
  switch (unit) {
    case 'kg':
    case 'g':
      return 'g';
    case 'l':
    case 'ml':
      return 'ml';
    default:
      return 'adet';
  }
}

/** Paket tanımı geçerli mi? */
export function hasPackageDefinition(ctx?: UnitContext): boolean {
  return Boolean(ctx?.packageSize && ctx.packageSize > 0 && ctx.packageUnit && ctx.packageUnit !== 'paket');
}

/** Miktarı kanonik taban birime çevirir. */
export function toBase(qty: number, unit: Unit, ctx?: UnitContext): number {
  if (!Number.isFinite(qty)) throw new UnitError('Geçersiz miktar');
  switch (unit) {
    case 'kg':
      return qty * 1000;
    case 'g':
      return qty;
    case 'l':
      return qty * 1000;
    case 'ml':
      return qty;
    case 'adet':
      return qty;
    case 'paket': {
      if (!hasPackageDefinition(ctx)) {
        throw new UnitError(
          'Paket birimi için "1 paket kaç birim eder" bilgisi tanımlanmalı.',
        );
      }
      const inner = toBase(ctx!.packageSize!, ctx!.packageUnit!);
      return qty * inner;
    }
    default:
      throw new UnitError(`Bilinmeyen birim: ${String(unit)}`);
  }
}

/** Kanonik taban birimden istenen birime çevirir. */
export function fromBase(qtyBase: number, unit: Unit, ctx?: UnitContext): number {
  if (!Number.isFinite(qtyBase)) throw new UnitError('Geçersiz miktar');
  switch (unit) {
    case 'kg':
      return qtyBase / 1000;
    case 'g':
      return qtyBase;
    case 'l':
      return qtyBase / 1000;
    case 'ml':
      return qtyBase;
    case 'adet':
      return qtyBase;
    case 'paket': {
      if (!hasPackageDefinition(ctx)) {
        throw new UnitError('Paket birimi için paket tanımı eksik.');
      }
      const inner = toBase(ctx!.packageSize!, ctx!.packageUnit!);
      return qtyBase / inner;
    }
    default:
      throw new UnitError(`Bilinmeyen birim: ${String(unit)}`);
  }
}

export function isConvertible(from: Unit, to: Unit, ctx?: UnitContext): boolean {
  if (from === to) return true;
  if (from === 'paket' && !hasPackageDefinition(ctx)) return false;
  if (to === 'paket' && !hasPackageDefinition(ctx)) return false;
  return unitFamily(baseUnitOf(from, ctx)) === unitFamily(baseUnitOf(to, ctx));
}

/** İki birim arasında dönüşüm. Uyumsuz birimlerde UnitError fırlatır. */
export function convert(qty: number, from: Unit, to: Unit, ctx?: UnitContext): number {
  if (from === to) return qty;
  if (!isConvertible(from, to, ctx)) {
    throw new UnitError(
      `${UNIT_LABELS[from]} ile ${UNIT_LABELS[to]} aynı türden değil, dönüştürülemez.`,
    );
  }
  return fromBase(toBase(qty, from, ctx), to, ctx);
}

/** Fiyatı taban birim başına hesaplar (örn. TL/g). */
export function pricePerBase(totalPrice: number, qty: number, unit: Unit, ctx?: UnitContext): number {
  const baseQty = toBase(qty, unit, ctx);
  if (baseQty <= 0) throw new UnitError('Miktar sıfırdan büyük olmalı.');
  return totalPrice / baseQty;
}
