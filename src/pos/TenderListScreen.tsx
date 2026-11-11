import { useState, type ReactNode } from 'react';
import { posItem } from '../lib/menu';
import { checkTotals, fmt } from '../lib/money';
import { actions, checkPlace, isTakeout, usePos } from '../lib/store';
import type { Check } from '../lib/types';
import { BluuLogo, dialogs } from './common';
import { IconCar, IconChecklist, IconForkSpoon, IconPerson, IconPrinter, IconQuickServe, IconTruck } from './icons';

type Filter = 'all' | 'dine-in' | 'takeout' | 'eat-in' | 'drive-thru' | 'delivery';

const pad = (n: number) => String(n).padStart(2, '0');

/** "11/06 05:51" as on the reference photo (12-hour clock, no AM/PM). */
function cardTime(ms: number) {
  const d = new Date(ms);
  const h = d.getHours() % 12 === 0 ? 12 : d.getHours() % 12;
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(h)}:${pad(d.getMinutes())}`;
}

/**
 * Main screen > Tender: every open check (dine-in tables and takeout orders).
 * Select one to see its items on the right, then Tender to pay it.
 */
export function TenderListScreen() {
  const checks = usePos((s) => s.checks);
  const settings = usePos((s) => s.settings);
  const currentUser = usePos((s) => s.currentUser);
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [myOrder, setMyOrder] = useState(false);
  const [sort, setSort] = useState<'check' | 'table'>('check');

  const matches = (c: Check) => {
    if (myOrder && c.server !== (currentUser ?? settings.serverName)) return false;
    if (filter === 'all') return true;
    if (filter === 'takeout') return isTakeout(c);
    if (filter === 'dine-in') return !isTakeout(c);
    return false; // Eat in / Drive-Thru / Delivery orders are not simulated
  };
  const open = Object.values(checks)
    .filter((c) => c.status === 'open' && matches(c))
    .sort((a, b) => (sort === 'check' ? b.number.localeCompare(a.number) : checkPlace(a).localeCompare(checkPlace(b), undefined, { numeric: true })));
  const sel = selected ? checks[selected] : null;

  const tender = () => {
    if (!sel || sel.status !== 'open') return dialogs.message('Please select an order first.', 'Tender');
    if (sel.lines.some((l) => l.status === 'new')) return dialogs.message('This order has new items that have not been ordered yet.', 'Tender');
    actions.openTender(sel.id);
  };

  const headerBtn = (label: string, x: number, w: number, icon: ReactNode) => (
    <button className="pos-btn" style={{ left: x, top: 16, width: w, height: 33, fontSize: label.length > 15 ? 11 : 13, gap: 6, justifyContent: 'flex-start', paddingLeft: 8 }} onClick={() => dialogs.notInSimulator(label)}>
      {icon}
      {label}
    </button>
  );

  const tab = (label: string, x: number, active: boolean, onClick: () => void) => (
    <button
      className="pos-btn"
      style={{
        left: x,
        top: 74,
        width: 223,
        height: 74,
        fontSize: 16,
        fontWeight: 'bold',
        color: active ? '#fff' : 'rgba(255,255,255,0.75)',
        background: active ? 'linear-gradient(#4f84ea, #3a6fdc)' : 'linear-gradient(#9fbcef, #8eaee8)',
        borderColor: '#7c98d0',
      }}
      onClick={onClick}
    >
      {label}
    </button>
  );

  const typeBtn = (label: string, f: Filter, i: number, icon: ReactNode) => (
    <button
      data-testid={`tl-filter-${f}`}
      className={`pos-btn ${filter === f ? 'pos-btn-blue' : ''}`}
      style={{ left: 134 + i * 94, top: 626, width: 90, height: 105, flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 'bold' }}
      onClick={() => setFilter(f)}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div className="pos-screen" style={{ background: '#f4f6f6' }}>
      <div className="pos-header">
        <div className="pos-abs" style={{ left: 16, top: 15 }}>
          <BluuLogo height={34} />
        </div>
        <div className="pos-abs" style={{ left: 186, top: 20, fontSize: 21, fontWeight: 'bold', color: '#2f5a9c' }}>
          Tender
        </div>
        {headerBtn('Change Order Type', 591, 151, <span style={{ fontSize: 15 }}>✎</span>)}
        {headerBtn('Server', 750, 91, <IconPerson size={18} />)}
        {headerBtn('REPRINT KITCHEN MEMO', 849, 165, <IconPrinter size={16} />)}
      </div>

      {tab('Check No', 13, sort === 'check', () => setSort('check'))}
      {tab('Table Name', 244, sort === 'table', () => setSort('table'))}
      {tab('Check No Search', 476, false, () => dialogs.notInSimulator('Check No Search'))}

      <div className="pos-abs" data-testid="tender-list" style={{ left: 13, top: 156, width: 690, height: 460, overflowY: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 223px)', gap: 4 }}>
          {open.map((c) => (
            <div
              key={c.id}
              role="button"
              data-testid={`tl-check-${c.number}`}
              onClick={() => setSelected(c.id)}
              style={{
                height: 74,
                position: 'relative',
                cursor: 'pointer',
                border: `1px solid ${c.id === selected ? '#3a6fdc' : '#c3c9d3'}`,
                outline: c.id === selected ? '2px solid #3a6fdc' : 'none',
                background: c.id === selected ? '#dbe6fa' : '#eef0f3',
                fontFamily: 'var(--pos-font)',
              }}
            >
              <div className="pos-abs" style={{ left: 7, top: 5, fontSize: 18, fontWeight: 'bold' }}>
                {c.number}
              </div>
              <div className="pos-abs" style={{ right: 6, top: 7, fontSize: 11.5 }}>
                {cardTime(c.openedAt)}
              </div>
              <div className="pos-abs" style={{ left: 0, top: 31, width: '100%', textAlign: 'center', fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden' }}>
                {checkPlace(c)}({c.server.toUpperCase()})
              </div>
              <div className="pos-abs" style={{ right: 6, bottom: 3, fontSize: 14, color: '#d0303a' }}>
                {fmt(checkTotals(c, settings.taxRate).balance)}
              </div>
            </div>
          ))}
        </div>
        {open.length === 0 && <div style={{ padding: 20, fontSize: 15, color: '#666' }}>There are no open orders.</div>}
      </div>

      {/* Selected order details */}
      <div className="pos-abs" data-testid="tl-selected" style={{ left: 712, top: 75, width: 306, height: 54, border: '1px solid #b9c0cb', background: '#fff', fontSize: 15, fontWeight: 'bold', padding: '15px 10px', color: '#2f5a9c' }}>
        {sel && `${sel.number}   ${checkPlace(sel)}`}
      </div>
      <div className="pos-abs" style={{ left: 712, top: 142, width: 306, height: 406, border: '1px solid #b9c0cb', background: '#f2f4f7' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '50px 1fr 64px', fontSize: 12.5, color: '#333', textAlign: 'center', borderBottom: '1px solid #b9c0cb', padding: '9px 0' }}>
          <span>Qty</span>
          <span>Menu</span>
          <span>Price</span>
        </div>
        <div data-testid="tl-items" style={{ overflowY: 'auto', height: 366 }}>
          {sel?.lines.map((l) => (
            <div key={l.id} style={{ display: 'grid', gridTemplateColumns: '50px 1fr 64px', fontSize: 12, padding: '5px 0', borderBottom: '1px solid #d5d9e0' }}>
              <span style={{ textAlign: 'center' }}>{l.qty}</span>
              <span>
                {posItem(l.posId).label}
                {l.modifier && <span style={{ color: '#2c4f9c' }}> - {l.modifier}</span>}
              </span>
              <span style={{ textAlign: 'right', paddingRight: 8 }}>{fmt(l.qty * l.unitPrice)}</span>
            </div>
          ))}
        </div>
      </div>
      <button className="pos-btn" style={{ left: 809, top: 554, width: 91, height: 51, fontSize: 16 }} onClick={() => document.querySelector('[data-testid=tl-items]')?.scrollBy({ top: -120, behavior: 'smooth' })}>
        ︿
      </button>
      <button className="pos-btn" style={{ left: 905, top: 554, width: 94, height: 51, fontSize: 16 }} onClick={() => document.querySelector('[data-testid=tl-items]')?.scrollBy({ top: 120, behavior: 'smooth' })}>
        ﹀
      </button>

      <button data-testid="tl-cancel" className="pos-btn pos-btn-blue" style={{ left: 709, top: 621, width: 91, height: 99, fontSize: 15 }} onClick={() => actions.goto('main')}>
        Cancel
      </button>
      <button data-testid="tl-edit" className="pos-btn" style={{ left: 806, top: 621, width: 91, height: 99, fontSize: 15 }} onClick={() => (sel ? actions.openCheck(sel.id) : dialogs.message('Please select an order first.', 'Edit'))}>
        Edit
      </button>
      <button data-testid="tl-tender" className="pos-btn pos-btn-navy" style={{ left: 903, top: 621, width: 91, height: 99, fontSize: 15 }} onClick={tender}>
        Tender
      </button>

      <button className={`pos-btn ${myOrder ? 'pos-btn-blue' : ''}`} style={{ left: 40, top: 629, width: 89, height: 48, fontSize: 12 }} onClick={() => setMyOrder((m) => !m)}>
        My Order
      </button>
      <button className="pos-btn" style={{ left: 40, top: 683, width: 89, height: 48, fontSize: 11.5 }} onClick={() => dialogs.notInSimulator('POS SEARCH')}>
        POS SEARCH
      </button>
      {typeBtn('All Type', 'all', 0, <IconChecklist size={28} color={filter === 'all' ? '#fff' : '#222'} />)}
      {typeBtn('Dine-in', 'dine-in', 1, <IconForkSpoon size={28} />)}
      {typeBtn('Take out', 'takeout', 2, <IconQuickServe size={28} />)}
      {typeBtn('Eat in', 'eat-in', 3, <IconForkSpoon size={28} />)}
      {typeBtn('Drive-Thru', 'drive-thru', 4, <IconCar size={28} />)}
      {typeBtn('Delivery', 'delivery', 5, <IconTruck size={28} />)}
    </div>
  );
}
