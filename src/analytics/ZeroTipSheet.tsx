import { useMemo, useState } from 'react';
import { ColumnChart } from '../ui/charts';
import { People } from './people';
import { dayKey, type Parsed, type Receipt } from './reports';

/** Card payments with a $0 tip. The automatic 18% counts as a tip, so those checks never appear. */
export function zeroTipCardPayments(p: Parsed): Receipt[] {
  return (p.sales ?? []).filter((r) => r.card > 0 && r.tip === 0).sort((a, b) => +a.dt - +b.dt);
}

const money = (n: number) => `$${n.toFixed(2)}`;
const isTakeOut = (r: Receipt) => /take\s*out|to\s*go|delivery/i.test(r.table) || !r.table;

function csv(rows: (string | number)[][]) {
  return rows.map((r) => r.map((c) => (/[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : String(c))).join(',')).join('\n');
}

/**
 * For checking against the paper tip sheet: every card payment closed with no tip, by date,
 * with whose table it was. Most of these guests tipped in cash.
 */
export function ZeroTipSheet({ parsed, people, onPerson }: { parsed: Parsed; people: People; onPerson: (emp: string) => void }) {
  const [takeOut, setTakeOut] = useState(true);
  const [who, setWho] = useState('');
  const all = useMemo(() => zeroTipCardPayments(parsed).map((r) => ({ r, emp: people.ofReceipt(r) })), [parsed, people]);
  const list = all.filter((x) => (takeOut || !isTakeOut(x.r)) && (!who || x.emp === who));
  const days = new Map<string, typeof list>();
  list.forEach((x) => days.set(dayKey(x.r.dt), [...(days.get(dayKey(x.r.dt)) ?? []), x]));
  const servers = [...new Set(all.map((x) => x.emp))].sort((a, b) => people.name(a).localeCompare(people.name(b)));
  const total = list.reduce((s, x) => s + x.r.card, 0);

  const download = () => {
    const rows: (string | number)[][] = [['Date', 'Time', 'Server', 'Table', 'Guests', 'Food & drink', 'Paid on card', 'Also paid cash', 'Check #']];
    list.forEach(({ r, emp }) =>
      rows.push([
        r.dt.toLocaleDateString(),
        r.dt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
        people.name(emp),
        r.table,
        r.persons,
        r.subtotal.toFixed(2),
        r.card.toFixed(2),
        r.cash > 0 ? r.cash.toFixed(2) : '',
        r.receipt,
      ]),
    );
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv(rows)], { type: 'text/csv' }));
    a.download = 'card-payments-with-no-tip.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  if (!all.length) return <div className="text-sm text-slate-400">No card payments with a $0 tip in the Detailed Sales List.</div>;

  return (
    <div className="space-y-3" data-testid="zero-tip-sheet">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <select value={who} onChange={(e) => setWho(e.target.value)} className="rounded-full bg-slate-900 px-3 py-1.5 text-slate-200 ring-1 ring-slate-700">
          <option value="">All servers</option>
          {servers.map((k) => (
            <option key={k} value={k}>
              {people.name(k)}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 rounded-full bg-slate-900 px-3 py-1.5 text-slate-200 ring-1 ring-slate-700">
          <input type="checkbox" checked={takeOut} onChange={(e) => setTakeOut(e.target.checked)} />
          Include take-out
        </label>
        <span className="text-slate-400">
          {list.length} payments · {money(total)} on cards · {days.size} days
        </span>
        <button className="ml-auto rounded-full border border-slate-700 px-3 py-1.5 text-slate-200 hover:bg-slate-800" onClick={download}>
          Download CSV
        </button>
      </div>
      {days.size > 1 && (
        <div className="rounded-2xl bg-slate-900/80 p-4 ring-1 ring-slate-800">
          <ColumnChart
            caption="Card payments with $0 tip, by day"
            series={[{ name: 'Payments', color: '#3987e5' }]}
            points={[...days.entries()].map(([, xs]) => {
              const by = new Map<string, number>();
              xs.forEach((x) => by.set(x.emp, (by.get(x.emp) ?? 0) + 1));
              const d = xs[0].r.dt;
              return {
                label: d.toLocaleDateString([], { month: 'numeric', day: 'numeric' }),
                values: [xs.length],
                title: `${d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}: ${xs.length} payment${xs.length > 1 ? 's' : ''}\n${[...by.entries()]
                  .sort((a, b) => b[1] - a[1])
                  .map(([e, n]) => `${people.name(e)} ${n}`)
                  .join('\n')}`,
              };
            })}
          />
        </div>
      )}
      {[...days.entries()].map(([k, xs]) => {
        const d = xs[0].r.dt;
        const perServer = new Map<string, number>();
        xs.forEach((x) => perServer.set(x.emp, (perServer.get(x.emp) ?? 0) + 1));
        return (
          <div key={k} className="overflow-x-auto rounded-2xl bg-slate-900/80 ring-1 ring-slate-800">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-800 px-4 py-2.5">
              <div className="font-semibold">{d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}</div>
              <div className="text-xs text-slate-400">
                {xs.length} payment{xs.length > 1 ? 's' : ''} ·{' '}
                {[...perServer.entries()]
                  .sort((a, b) => b[1] - a[1])
                  .map(([e, n]) => `${people.name(e)} ${n}`)
                  .join(' · ')}
              </div>
            </div>
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-slate-400">
                <tr>
                  <th className="px-4 py-1.5 font-medium">Time</th>
                  <th className="px-2 py-1.5 font-medium">Server</th>
                  <th className="px-2 py-1.5 font-medium">Table</th>
                  <th className="px-2 py-1.5 text-right font-medium">Guests</th>
                  <th className="px-2 py-1.5 text-right font-medium">Food & drink</th>
                  <th className="px-2 py-1.5 text-right font-medium">Paid on card</th>
                  <th className="px-2 py-1.5 font-medium"></th>
                  <th className="px-4 py-1.5 text-right font-medium">Check #</th>
                </tr>
              </thead>
              <tbody>
                {xs.map(({ r, emp }) => (
                  <tr key={r.receipt} className="border-t border-slate-800/80">
                    <td className="whitespace-nowrap px-4 py-1.5 tabular-nums">{r.dt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</td>
                    <td className="whitespace-nowrap px-2 py-1.5">
                      <button className="font-medium underline decoration-dotted underline-offset-2 hover:text-sky-200" onClick={() => onPerson(emp)}>
                        {people.name(emp)}
                      </button>
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5">{r.table}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{r.persons}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{money(r.subtotal)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{money(r.card)}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-xs text-slate-400">{r.cash > 0 ? `+ ${money(r.cash)} cash` : ''}</td>
                    <td className="whitespace-nowrap px-4 py-1.5 text-right font-mono text-[11px] text-slate-500">{r.receipt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
