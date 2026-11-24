import { useMemo, useState } from 'react';
import { category, mappings, posItem } from '../lib/menu';

/** Practice-mode only: look up where a menu item lives on the POS. */
export function HelpPanel() {
  const [q, setQ] = useState('');
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s.length < 2) return [];
    return mappings
      .filter((m) => m.customerName.toLowerCase().includes(s) || m.aliases.some((a) => a.toLowerCase().includes(s)) || (m.posName ?? '').toLowerCase().includes(s))
      .slice(0, 30);
  }, [q]);

  return (
    <div className="flex h-full flex-col text-slate-100">
      <div className="border-b border-slate-700 px-4 py-3">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-sky-300">Practice help</div>
        <div className="font-semibold">Where is it on the POS?</div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Type what the guest said, e.g. brisket, Coke"
          className="mt-2 w-full rounded bg-white px-3 py-2 text-sm text-slate-900"
        />
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3 text-sm">
        {q.trim().length < 2 && (
          <div className="space-y-3 text-slate-300">
            <p>Search the customer menu to see which POS group and button to use. This help is not available in Training Mode.</p>
            <div className="rounded-lg bg-slate-800 p-3">
              <div className="mb-1 font-semibold text-amber-300">AYCE house rules (from the AYCE menu)</div>
              <ul className="list-disc space-y-1 pl-5 text-slate-300">
                <li>Max 4 meat items per order, per table, at a time. If guests ask for more, explain the limit and ask them which to drop; don't hold extra meat for later. Beef Tongue 6oz and Scallop 8pcs are paid add-ons and don't count.</li>
                <li>Everyone at the table does AYCE, or everyone orders à la carte. AYCE tables can still add à la carte items. The POS doesn't enforce this; you do.</li>
                <li>Premium lunch price: Mon–Fri only. Weekend lunch rings PREMIUM AYCE (DINNER).</li>
                <li>Children: 5–8 and 9–12 prices; under 4 free (ring nothing).</li>
                <li>Single guest: $5.00 additional charge.</li>
                <li>Galbi on Premium: +$3.95, limit 1 per person (not enforced by the POS).</li>
                <li>Ultimate's included drink: ring only ULTIMATE W/ SODA or W/ BEER. Galbi, beef tongue, scallops, tuna biscuit and japchae for Ultimate tables are in AYCE ULTIMATE.</li>
                <li>
                  <b>Void</b> takes an item off after it was ordered: your own entry mistake (then ring in the right item), or an item that never came out
                  and the guests no longer want. <b>Void / Edit</b> → select the item → <b>−</b> → type the reason → OK → <b>Apply</b>, then press{' '}
                  <b>Order</b> to send the void (Close without Order throws it away).
                </li>
                <li>
                  <b>Tip Adjustments:</b> when a card guest leaves the signed merchant copy, enter the tip they wrote (right away, or when you have a moment
                  later in the shift). Main → <b>Tip Adjustments</b> → <b>Search With Receipt Number</b> → the check number (e.g. 10060) → tap the payment →
                  type the tip → Ok. A blank tip line: nothing to enter.
                </li>
                <li>
                  <b>Employee discount:</b> 20% on an employee's own food during their shift (take-out too); 10% off duty for employees and immediate family
                  (parents, siblings, spouse, children; not cousins or friends). <b>Discount</b> → type the employee's name and relationship (e.g. JOON SELF,
                  JEISLER MOTHER) → Ok → <b>Discount Order</b> → <b>&lt;&lt;20%&gt;&gt;</b> or <b>&lt;&lt;10%&gt;&gt;</b> / <b>Emp Disc</b> (10%) → Ok.
                </li>
                <li>
                  <b>Table sizes:</b> A, B, Y3–Y5 up to 4; C, M, Y1–Y2 up to 6; W tables 4 each, or up to 8 when W1&amp;2, W3&amp;4 or W5&amp;6 are used
                  together. A party of 7–8 sits across the pair as two checks (up to 4 at each).
                </li>
                <li>
                  <b>Move/Join</b> (Dine-in): tap Move/Join, the table to move, then where it goes. <b>Move</b> takes a check to an empty table (bar guests
                  getting a table for AYCE: their drinks come along). <b>Join</b> combines two checks: a party on two W tables is joined into one check when
                  they are ready to pay, and the 18% for 5+ guests is added after the join.
                </li>
                <li>
                  <b>You ring in AND bring out:</b> rice, green salad, rice paper, garlic &amp; jalapeño, sesame oil, ssamjang (bean paste), miso soup, seaweed
                  soup, spicy miso stew. Everything else comes from the kitchen.
                </li>
                <li>18% tip is added automatically for dine-in parties of 5 or more.</li>
                <li>$10/person or plate surcharge for leftover food. 2 hour limit.</li>
              </ul>
            </div>
          </div>
        )}
        {results.map((m) => {
          const it = m.posId ? posItem(m.posId) : null;
          return (
            <div key={m.customerItemId} className="rounded-lg bg-slate-800 p-3">
              <div className="font-semibold">{m.customerName}</div>
              {it ? (
                <div className="mt-1 text-slate-300">
                  <span className="rounded px-1.5 py-0.5 text-xs font-bold text-white" style={{ background: category(it.category).color }}>
                    {category(it.category).label}
                  </span>{' '}
                  → <b>{it.label}</b> <span className="text-slate-400">({it.page > 1 ? `page ${it.page}, ` : ''}row {it.row}, column {it.col})</span>
                  {it.serverServed && <div className="mt-1 text-xs text-sky-300">Ring it in, then bring it out yourself.</div>}
                  {it.addOn && <div className="mt-1 text-xs text-sky-300">Paid add-on; not part of the 4-meat limit.</div>}
                </div>
              ) : (
                <div className="mt-1 text-rose-300">No POS button found in the reference screenshots.</div>
              )}
              {m.note && <div className="mt-1 text-xs text-amber-300">⚠ {m.note}</div>}
            </div>
          );
        })}
        {q.trim().length >= 2 && results.length === 0 && <div className="text-slate-400">No matches.</div>}
      </div>
    </div>
  );
}
