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
}

/**
 * Totals for a check. `includeUnsent` controls whether lines that have not
 * been submitted with Order count (the order screen shows them; the floor
 * plan and tender screen only reflect what was ordered).
 */
export function checkTotals(check: Check, taxRate: number, includeUnsent = false): Totals {
  const lines = check.lines.filter((l) => includeUnsent || l.status === 'sent');
  const orderCents = lines.reduce((s, l) => s + toCents(l.unitPrice) * l.qty, 0);
  const subtotalCents = orderCents;
  const tax = taxCents(subtotalCents, taxRate);
  const amountDue = subtotalCents + tax;
  const gratuity = toCents(check.gratuity);
  const totalDue = amountDue + gratuity;
  const received = check.payments.reduce((s, p) => s + toCents(p.amount), 0);
  return {
    orderAmount: fromCents(orderCents),
    discount: 0,
    surcharge: 0,
    subtotal: fromCents(subtotalCents),
    tax: fromCents(tax),
    amountDue: fromCents(amountDue),
    gratuity: fromCents(gratuity),
    totalDue: fromCents(totalDue),
    totalReceived: fromCents(received),
    balance: fromCents(totalDue - received),
  };
}
