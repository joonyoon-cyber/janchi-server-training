import { posItem } from './menu';
import type { Check } from './types';

/** All arithmetic is done in integer cents to avoid floating point drift. */
export const toCents = (dollars: number) => Math.round(dollars * 100);
export const fromCents = (cents: number) => cents / 100;

export function fmt(dollars: number): string {
  return (Math.round(dollars * 100) / 100).toFixed(2);
}

export function taxCents(subtotalCents: number, ratePercent: number): number {
  // Round half up; the epsilon guards against values like 615.4999999.
  return Math.round((subtotalCents * ratePercent) / 100 + 1e-6);
}

export interface Totals {
  orderAmount: number;
  discount: number;
  surcharge: number;
  subtotal: number;
  tax: number;
  amountDue: number;
  gratuity: number;
  totalDue: number;
  totalReceived: number;
  balance: number;
  /** Automatic 18% tip for parties of AUTO_TIP_MIN_GUESTS or more (part of `gratuity`). */
  autoTip: number;
}

/** House rule: 18% tip is added automatically for parties of 5 or more (on the pre-tax subtotal). */
export const AUTO_TIP_PERCENT = 18;
export const AUTO_TIP_MIN_GUESTS = 5;

export function autoTipCents(subtotalCents: number, guests: number): number {
  return guests >= AUTO_TIP_MIN_GUESTS ? Math.round((subtotalCents * AUTO_TIP_PERCENT) / 100) : 0;
}

/**
 * Totals for a check. `includeUnsent` controls whether lines that have not
 * been submitted with Order count (the order screen shows them; the floor
 * plan and tender screen only reflect what was ordered).
 */
/** Cents off for a Discount Order: a percent of the order, or dollars (never more than the order). */
export function discountOf(d: { kind: 'pct' | 'amt'; value: number } | undefined, orderCents: number): number {
  if (!d || d.value <= 0) return 0;
  const c = d.kind === 'pct' ? Math.round((orderCents * Math.min(d.value, 100)) / 100) : toCents(d.value);
  return Math.max(0, Math.min(c, orderCents));
}

export function checkTotals(check: Check, taxRate: number, includeUnsent = false): Totals {
  const lines = check.lines.filter((l) => includeUnsent || l.status === 'sent');
  const orderCents = lines.reduce((s, l) => s + toCents(l.unitPrice) * l.qty, 0);
  const discountCents = discountOf(check.discount, orderCents);
  const subtotalCents = orderCents - discountCents;
  const taxableBefore = lines.filter((l) => !posItem(l.posId).taxExempt).reduce((s, l) => s + toCents(l.unitPrice) * l.qty, 0);
  // Tax is charged on the discounted amount (POS video: 3.50 juice, 10% off -> 3.15, tax 0.23).
  const taxable = orderCents ? Math.round((taxableBefore * subtotalCents) / orderCents) : 0;
  const tax = taxCents(taxable, taxRate);
  const amountDue = subtotalCents + tax;
  // 128.40 subtotal for 6 guests -> 23.11 tip, as on the reference photo.
  const autoTip = check.orderType === 'takeout' ? 0 : autoTipCents(subtotalCents, check.guests);
  const gratuity = autoTip + toCents(check.gratuity);
  const totalDue = amountDue + gratuity;
  const received = check.payments.reduce((s, p) => s + toCents(p.amount), 0);
  return {
    orderAmount: fromCents(orderCents),
    discount: fromCents(discountCents),
    surcharge: 0,
    subtotal: fromCents(subtotalCents),
    tax: fromCents(tax),
    amountDue: fromCents(amountDue),
    gratuity: fromCents(gratuity),
    totalDue: fromCents(totalDue),
    totalReceived: fromCents(received),
    balance: fromCents(totalDue - received),
    autoTip: fromCents(autoTip),
  };
}
