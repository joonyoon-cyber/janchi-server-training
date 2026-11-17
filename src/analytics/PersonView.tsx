import { useMemo, useState, type ReactNode } from 'react';
import { CHECKS, robustZ, type CheckResult, type Finding, type Severity } from './checks';
import { People } from './people';
import { dayKey, type Parsed } from './reports';

const SEV_ORDER: Severity[] = ['high', 'medium', 'low'];
const SEV_LABEL: Record<Severity, string> = { high: 'Look into', medium: 'Worth a look', low: 'FYI' };
const SEV_CHIP: Record<Severity, string> = {
  high: 'bg-rose-900/70 text-rose-100 ring-rose-700',
  medium: 'bg-amber-900/60 text-amber-100 ring-amber-700',
  low: 'bg-slate-800 text-slate-300 ring-slate-700',
};
const ROW_TINT: Record<Severity, string> = { high: 'bg-rose-950/50', medium: 'bg-amber-950/30', low: '' };

const money = (n: number) => `$${n.toFixed(2)}`;
const fmtDay = (d: Date) => d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
const fmtTime = (d: Date) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const fmtWhen = (d: Date | null) => (d ? `${fmtDay(d)} ${fmtTime(d)}` : 'Whole period');

type Tagged = Finding & { check: string };

export function allFindings(results: Record<string, CheckResult>): Tagged[] {
  return CHECKS.flatMap((c) => (results[c.id]?.findings ?? []).map((f) => ({ ...f, check: c.title })));
}

function SevChip({ sev }: { sev: Severity }) {
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${SEV_CHIP[sev]}`}>{SEV_LABEL[sev]}</span>;
}

/** Flags attached to one entry (matched by check/receipt number, or by person + time for punches). */
function Flags({ list }: { list: Tagged[] }) {
  if (!list.length) return null;
  return (
    <div className="space-y-0.5">
      {list.map((f, i) => (
        <div key={i} className="flex items-start gap-1.5 text-[11px] leading-tight">
          <SevChip sev={f.sev} />
          <span className="text-slate-200">{f.what}</span>
        </div>
      ))}
    </div>
  );
}

const worst = (list: Tagged[]): Severity | null => SEV_ORDER.find((s) => list.some((f) => f.sev === s)) ?? null;

function Section({ title, count, children, open = false }: { title: string; count: number; children: ReactNode; open?: boolean }) {
  return (
    <details open={open} className="group rounded-2xl bg-slate-900/80 ring-1 ring-slate-800">
      <summary className="flex cursor-pointer items-center justify-between px-4 py-3 font-semibold">
        <span>{title}</span>
        <span className="text-xs font-normal text-slate-400">{count} entr{count === 1 ? 'y' : 'ies'}</span>
      </summary>
      <div className="overflow-x-auto border-t border-slate-800">{children}</div>
    </details>
  );
}

function Table({ head, rows, limit = 40 }: { head: string[]; rows: { cells: ReactNode[]; sev: Severity | null }[]; limit?: number }) {
  const [n, setN] = useState(limit);
  if (!rows.length) return <div className="px-4 py-3 text-sm text-slate-500">None in these files.</div>;
  return (
    <>
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-slate-400">
          <tr>
            {head.map((h, i) => (
              <th key={i} className="whitespace-nowrap px-3 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, n).map((r, i) => (
            <tr key={i} className={`border-t border-slate-800/80 align-top ${r.sev ? ROW_TINT[r.sev] : ''}`}>
              {r.cells.map((c, j) => (
                <td key={j} className="whitespace-nowrap px-3 py-1.5">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > n && (
        <button className="w-full border-t border-slate-800 py-2 text-xs text-sky-300 hover:bg-slate-800/60" onClick={() => setN((x) => x + 100)}>
          Show more ({rows.length - n} left)
        </button>
      )}
    </>
  );
}

/** Every entry for one person across the loaded files, with anything flagged highlighted. */
export function PersonView({ emp, parsed, people, results }: { emp: string; parsed: Parsed; people: People; results: Record<string, CheckResult> }) {
  const tagged = useMemo(() => allFindings(results), [results]);
  const mine = tagged.filter((f) => f.emp === emp);
  const byRef = useMemo(() => {
    const m = new Map<string, Tagged[]>();
    tagged.forEach((f) => f.ref && m.set(f.ref, [...(m.get(f.ref) ?? []), f]));
    return m;
  }, [tagged]);
  const flagsFor = (ref: string, who = emp) => (byRef.get(ref) ?? []).filter((f) => f.emp === who);
  const flagsAt = (t: Date) => mine.filter((f) => !f.ref && f.when && +f.when === +t);

  // Team comparison for this person, from every check that has a row for them.
  const compare = CHECKS.flatMap((c) => {
    const r = results[c.id];
    const i = r?.rows.findIndex((x) => x.emp === emp) ?? -1;
    if (!r || i < 0) return [];
    return r.metrics
      .filter((m) => m.worse)
      .map((m) => {
        const zs = robustZ(r.rows.map((x) => x.values[m.key] ?? null));
        const z = zs[i] === null ? null : m.worse === 'high' ? zs[i] : -zs[i]!;
        return { check: c.title, label: m.label, value: r.rows[i].values[m.key], fmt: m.fmt, z };
      });
  });

  const receipts = (parsed.sales ?? []).filter((r) => people.ofReceipt(r) === emp).sort((a, b) => +b.dt - +a.dt);
  const punches = (parsed.timecard ?? []).filter((x) => people.key(x.emp) === emp).sort((a, b) => +b.in - +a.in);
  const shifts = people.shiftsOf(emp);
  const discounts = (parsed.discounts ?? []).filter((d) => people.key(d.placedBy) === emp && d.amount > 0).sort((a, b) => +b.placed - +a.placed);
  const cancels = (parsed.cancels ?? []).filter((c) => people.key(c.canceledBy) === emp).sort((a, b) => +b.placed - +a.placed);
  const voidRows = (parsed.voids ?? []).filter((v) => people.key(v.emp) === emp);
  const voids = [...new Set(voidRows.map((v) => v.receipt))].map((rc) => {
    const vs = voidRows.filter((v) => v.receipt === rc);
    return { receipt: rc, dt: vs[0].dt, items: vs.length, amount: vs.reduce((s, v) => s + v.amount, 0), cash: vs.reduce((s, v) => s + v.cash, 0), card: vs.reduce((s, v) => s + v.card, 0), reason: vs.find((v) => v.reason)?.reason ?? '' };
  });
  const prices = (parsed.priceChanges ?? []).filter((c) => people.key(c.emp) === emp).sort((a, b) => +b.dt - +a.dt);
  // Per day: sales and tips, to compare with the paper tip sheet.
  const days = new Map<string, { day: Date; checks: number; cash: number; card: number; cardTips: number; zero: number }>();
  (parsed.salesByDate ?? [])
    .filter((d) => people.key(d.emp) === emp)
    .forEach((d) => days.set(dayKey(d.day), { day: d.day, checks: d.checks, cash: d.cash, card: d.card, cardTips: 0, zero: 0 }));
  (parsed.tips ?? [])
    .filter((t) => people.key(t.emp) === emp)
    .forEach((t) => {
      const k = dayKey(t.added);
      const x = days.get(k) ?? { day: new Date(t.added.getFullYear(), t.added.getMonth(), t.added.getDate()), checks: 0, cash: 0, card: 0, cardTips: 0, zero: 0 };
      x.cardTips += t.card;
      days.set(k, x);
    });
  receipts.forEach((r) => {
    if (r.card > 0 && r.cash === 0 && r.tip === 0 && r.persons < 5) {
      const x = days.get(dayKey(r.dt));
      if (x) x.zero++;
    }
  });
  const dayList = [...days.values()].sort((a, b) => +b.day - +a.day);

  const sorted = [...mine].sort((a, b) => SEV_ORDER.indexOf(a.sev) - SEV_ORDER.indexOf(b.sev) || +(b.when ?? 0) - +(a.when ?? 0));
  const counts = SEV_ORDER.map((s) => mine.filter((f) => f.sev === s).length);

  return (
    <div className="space-y-4" data-testid="person-view">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h3 className="text-2xl font-black">{people.name(emp)}</h3>
          <div className="text-sm text-slate-400">{people.role(emp) ?? 'Role not on the schedule'}</div>
        </div>
        <div className="ml-auto flex gap-1.5 text-xs font-semibold">
          {SEV_ORDER.map((s, i) => (
            <span key={s} className={`rounded-full px-2.5 py-1 ring-1 ${SEV_CHIP[s]}`}>
              {SEV_LABEL[s]} {counts[i]}
            </span>
          ))}
        </div>
      </div>

      {compare.some((c) => c.z !== null && c.z >= 1) && (
        <div className="rounded-2xl bg-slate-900/80 p-4 ring-1 ring-slate-800">
          <div className="mb-2 font-semibold">Where they differ from the team</div>
          <div className="flex flex-wrap gap-2">
            {compare
              .filter((c) => c.z !== null && c.z >= 1)
              .sort((a, b) => (b.z ?? 0) - (a.z ?? 0))
              .map((c, i) => (
                <span key={i} className={`rounded-xl px-3 py-1.5 text-xs ${c.z! >= 2 ? 'bg-rose-900/60 text-rose-100' : 'bg-amber-900/40 text-amber-100'}`}>
                  <span className="text-slate-300">{c.check}:</span> <b>{c.label}</b> {c.value === null || c.value === undefined ? '' : c.fmt === 'money' ? `$${Math.round(c.value)}` : c.fmt === 'pct' ? `${c.value.toFixed(1)}%` : c.value.toFixed(1)}
                </span>
              ))}
          </div>
        </div>
      )}

      <Section title="Everything flagged for them" count={mine.length} open>
        <Table
          head={['Level', 'Check', 'When', 'What', 'Details', 'Check #']}
          rows={sorted.map((f) => ({ sev: f.sev, cells: [<SevChip sev={f.sev} />, <span className="text-slate-400">{f.check}</span>, <span className="text-xs text-slate-400">{fmtWhen(f.when)}</span>, f.what, <span className="block min-w-[22rem] max-w-[40rem] whitespace-normal text-slate-300">{f.detail}</span>, <span className="font-mono text-[11px] text-slate-500">{f.ref ?? ''}</span>] }))}
        />
      </Section>

      {(punches.length > 0 || shifts.length > 0) && (
        <Section title="Shifts: scheduled vs clocked" count={punches.length}>
          <Table
            head={['Day', 'Scheduled', 'Clocked in', 'Clocked out', 'Hours', 'Flags']}
            rows={punches.map((x) => {
              const sched = shifts.filter((s) => s.day.toDateString() === x.in.toDateString());
              const fl = flagsAt(x.in);
              return {
                sev: worst(fl),
                cells: [
                  fmtDay(x.in),
                  sched.length ? sched.map((s) => `${s.meal} ${s.raw}`).join(', ') : <span className="text-slate-500">–</span>,
                  fmtTime(x.in),
                  x.out ? (x.out.toDateString() === x.in.toDateString() ? fmtTime(x.out) : fmtWhen(x.out)) : <span className="text-rose-300">none</span>,
                  x.out ? ((+x.out - +x.in) / 3600000).toFixed(2) : '',
                  <Flags list={fl} />,
                ],
              };
            })}
          />
        </Section>
      )}

      {receipts.length > 0 && (
        <Section title="Checks they served" count={receipts.length}>
          <Table
            head={['When', 'Table', 'Guests', 'Food & drink', 'Tip', 'Tip %', 'Paid', 'Flags', 'Check #']}
            rows={receipts.map((r) => {
              const fl = flagsFor(r.receipt);
              const tp = r.subtotal > 0 ? (r.tip / r.subtotal) * 100 : null;
              return {
                sev: worst(fl),
                cells: [
                  `${fmtDay(r.dt)} ${fmtTime(r.dt)}`,
                  r.table,
                  r.persons,
                  money(r.subtotal),
                  money(r.tip),
                  tp === null ? '' : `${tp.toFixed(0)}%`,
                  r.cash > 0 && r.card > 0 ? 'cash + card' : r.cash > 0 ? 'cash' : r.card > 0 ? 'card' : 'other',
                  <Flags list={fl} />,
                  <span className="font-mono text-[11px] text-slate-500">{r.receipt}</span>,
                ],
              };
            })}
          />
        </Section>
      )}

      {dayList.length > 0 && (
        <Section title="Day by day: sales and tips (compare with the tip sheet)" count={dayList.length}>
          <Table
            head={['Day', 'Checks', 'Cash sales', 'Card sales', 'Card tips', '$0-tip card checks']}
            rows={dayList.map((d) => ({ sev: null, cells: [fmtDay(d.day), d.checks, money(d.cash), money(d.card), money(d.cardTips), d.zero || ''] }))}
          />
        </Section>
      )}

      {discounts.length > 0 && (
        <Section title="Discounts they rang" count={discounts.length}>
          <Table
            head={['When', 'Table', 'Discount', 'Off', 'Check', 'Note', 'Flags']}
            rows={discounts.map((d) => {
              const fl = flagsFor(d.ticket);
              return { sev: worst(fl), cells: [`${fmtDay(d.placed)} ${fmtTime(d.placed)}`, d.table, d.name.replace(/[<>]/g, ''), money(d.amount), money(d.itemsAmount), d.note || <span className="text-slate-500">no note</span>, <Flags list={fl} />] };
            })}
          />
        </Section>
      )}

      {cancels.length > 0 && (
        <Section title="Items they took off orders" count={cancels.length}>
          <Table
            head={['Ordered', 'Table', 'Item', 'Value', 'Removed after', 'Ordered by', 'Flags']}
            rows={cancels.map((c) => {
              const fl = flagsFor(c.check);
              const mins = c.cancelled ? Math.round((+c.cancelled - +c.placed) / 60000) : null;
              return {
                sev: mins !== null && mins >= 20 ? worst(fl) : null,
                cells: [`${fmtDay(c.placed)} ${fmtTime(c.placed)}`, c.table, `${c.qty > 1 ? `${c.qty}× ` : ''}${c.menu}`, money(c.amount), mins === null ? '' : `${mins} min`, people.name(people.key(c.placedBy)), mins !== null && mins >= 20 ? <Flags list={fl} /> : null],
              };
            })}
          />
        </Section>
      )}

      {voids.length > 0 && (
        <Section title="Paid checks they voided" count={voids.length}>
          <Table
            head={['When', 'Items', 'Value', 'Paid cash', 'Paid card', 'Reason', 'Flags']}
            rows={voids.map((v) => {
              const fl = flagsFor(v.receipt);
              return { sev: worst(fl), cells: [`${fmtDay(v.dt)} ${fmtTime(v.dt)}`, v.items, money(-v.amount), v.cash ? money(-v.cash) : '', v.card ? money(-v.card) : '', v.reason || <span className="text-slate-500">none</span>, <Flags list={fl} />] };
            })}
          />
        </Section>
      )}

      {prices.length > 0 && (
        <Section title="Prices they changed" count={prices.length}>
          <Table
            head={['When', 'Item', 'From', 'To', 'Check #', 'Flags']}
            rows={prices.map((c) => {
              const fl = flagsFor(c.receipt).filter((f) => f.detail.includes(c.item));
              return { sev: worst(fl), cells: [`${fmtDay(c.dt)} ${fmtTime(c.dt)}`, c.item, money(c.before), money(c.after), <span className="font-mono text-[11px] text-slate-500">{c.receipt}</span>, <Flags list={fl} />] };
            })}
          />
        </Section>
      )}
    </div>
  );
}

/** Every flagged entry from every check that ran, in one list. */
export function FlaggedView({ results, people, onPerson }: { results: Record<string, CheckResult>; people: People; onPerson: (emp: string) => void }) {
  const [sev, setSev] = useState<Severity | 'hm'>('high');
  const [check, setCheck] = useState('');
  const all = useMemo(() => allFindings(results), [results]);
  const list = all
    .filter((f) => (sev === 'hm' ? f.sev !== 'low' : f.sev === sev) && (!check || f.check === check))
    .sort((a, b) => SEV_ORDER.indexOf(a.sev) - SEV_ORDER.indexOf(b.sev) || +(b.when ?? 0) - +(a.when ?? 0));
  const checks = [...new Set(all.map((f) => f.check))];
  return (
    <div className="space-y-3" data-testid="flagged-view">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <div className="flex rounded-full bg-slate-900 p-1 ring-1 ring-slate-800">
          {(
            [
              ['high', `Look into ${all.filter((f) => f.sev === 'high').length}`],
              ['hm', `+ Worth a look ${all.filter((f) => f.sev !== 'low').length}`],
              ['low', `FYI ${all.filter((f) => f.sev === 'low').length}`],
            ] as const
          ).map(([k, label]) => (
            <button key={k} className={`rounded-full px-3 py-1 font-semibold ${sev === k ? 'bg-sky-600 text-white' : 'text-slate-300 hover:text-white'}`} onClick={() => setSev(k)}>
              {label}
            </button>
          ))}
        </div>
        <select value={check} onChange={(e) => setCheck(e.target.value)} className="rounded-full bg-slate-900 px-3 py-1.5 text-slate-200 ring-1 ring-slate-700">
          <option value="">All checks</option>
          {checks.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      <div className="overflow-x-auto rounded-2xl bg-slate-900/80 ring-1 ring-slate-800">
        <Table
          limit={80}
          head={['Level', 'Person', 'Check', 'When', 'What', 'Details', 'Check #']}
          rows={list.map((f) => ({
            sev: f.sev,
            cells: [
              <SevChip sev={f.sev} />,
              <button className="font-semibold text-sky-200 underline decoration-dotted underline-offset-2 hover:text-white" onClick={() => onPerson(f.emp)}>
                {people.name(f.emp)}
              </button>,
              <span className="text-slate-400">{f.check}</span>,
              <span className="text-xs text-slate-400">{fmtWhen(f.when)}</span>,
              f.what,
              <span className="block min-w-[22rem] max-w-[40rem] whitespace-normal text-slate-300">{f.detail}</span>,
              <span className="font-mono text-[11px] text-slate-500">{f.ref ?? ''}</span>,
            ],
          }))}
        />
      </div>
    </div>
  );
}
