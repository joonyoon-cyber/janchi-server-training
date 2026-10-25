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
                <li>Max 4 meat items per order, per table, at a time.</li>
                <li>Everyone at the table must order the same AYCE choice; otherwise à la carte. (Exception: guests with disabilities, per management.)</li>
                <li>Premium lunch price: Mon–Fri only, excluding Sat/Sun &amp; holidays.</li>
                <li>Children: 5–8 and 9–12 prices; under 4 free.</li>
                <li>Single guest: $5.00 additional charge.</li>
                <li>Galbi on Premium: +$3.95, limit 1 per person.</li>
                <li>18% gratuity for parties of 5 or more.</li>
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
                  → <b>{it.label}</b> <span className="text-slate-400">(row {it.row}, column {it.col})</span>
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
