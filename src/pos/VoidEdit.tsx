import { useEffect, useRef, useState } from 'react';
import { posItem } from '../lib/menu';
import { fmt } from '../lib/money';
import { actions } from '../lib/store';
import type { Check, OrderLine } from '../lib/types';
import { dialogs } from './common';

/**
 * Void / Edit (as on the real BLUU POS): the check's items as a full list. Select an ordered item,
 * press −, type the reason, and a "-1" line appears. Apply puts the void lines on the check
 * (unsent, already off the total); Order sends them to the kitchen.
 */
export function VoidEditScreen({ check, onClose }: { check: Check; onClose: () => void }) {
  const [sel, setSel] = useState<string | null>(null);
  // Voids typed in on this screen, not applied yet: line id -> qty and reason.
  const [drafts, setDrafts] = useState<Record<string, { qty: number; reason: string }>>({});
  const [top, setTop] = useState(0);

  const voidedAlready = (l: OrderLine) => check.lines.filter((x) => x.voidOf === l.id).reduce((s, x) => s - x.qty, 0);
  const left = (l: OrderLine) => l.qty - voidedAlready(l) - (drafts[l.id]?.qty ?? 0);

  type Row = { key: string; qty: number; name: string; amount: number; line?: OrderLine; draftOf?: string; pending?: boolean };
  const rows: Row[] = [];
  check.lines.forEach((l) => {
    rows.push({ key: l.id, qty: l.qty, name: posItem(l.posId).label, amount: Math.abs(l.qty) * l.unitPrice, line: l, pending: l.status === 'new' });
    const d = drafts[l.id];
    if (d) rows.push({ key: `draft-${l.id}`, qty: -d.qty, name: posItem(l.posId).label, amount: d.qty * l.unitPrice, draftOf: l.id, pending: true });
  });
  const visible = rows.slice(top, top + 12);
  const selRow = rows.find((r) => r.key === sel);

  const minus = () => {
    if (!selRow) return dialogs.message('Select an item first.', 'Void / Edit');
    if (selRow.draftOf) {
      const l = check.lines.find((x) => x.id === selRow.draftOf)!;
      if (left(l) <= 0) return;
      return setDrafts((d) => ({ ...d, [l.id]: { ...d[l.id], qty: d[l.id].qty + 1 } }));
    }
    const l = selRow.line!;
    if (l.qty < 0) return;
    if (l.status === 'new') {
      // Not ordered yet: just change it.
      if (l.qty > 1) actions.setLineQty(l.id, l.qty - 1);
      else actions.removeLine(l.id);
      return;
    }
    if (left(l) <= 0) return dialogs.message('This item has already been voided.', 'Void / Edit');
    reasonKeyboard((reason) => {
      setDrafts((d) => ({ ...d, [l.id]: { qty: (d[l.id]?.qty ?? 0) + 1, reason: d[l.id]?.reason ?? reason } }));
      setSel(`draft-${l.id}`);
    });
  };
  const plus = () => {
    if (!selRow) return dialogs.message('Select an item first.', 'Void / Edit');
    if (selRow.draftOf) {
      const id = selRow.draftOf;
      return setDrafts((d) => {
        const n = (d[id]?.qty ?? 0) - 1;
        const { [id]: _gone, ...rest } = d;
        return n > 0 ? { ...d, [id]: { ...d[id], qty: n } } : rest;
      });
    }
    if (selRow.line?.status === 'new' && selRow.line.qty > 0) actions.setLineQty(selRow.line.id, selRow.line.qty + 1);
  };
  const apply = () => {
    const list = Object.entries(drafts);
    if (!list.length) return onClose();
    // No manager PIN for voids (confirmed by the restaurant).
    for (const [lineId, d] of list) {
      const err = actions.addVoid(lineId, d.qty, d.reason);
      if (err) dialogs.message(err, 'Void / Edit');
    }
    onClose();
  };

  const side = (label: string, y: number, h: number, onClick: () => void, opts: { blue?: boolean; icon?: string } = {}) => (
    <button
      data-testid={`voidedit-${label}`}
      className={`pos-btn ${opts.blue ? 'pos-btn-blue' : ''}`}
      style={{ left: 904, top: y, width: 110, height: h, fontSize: opts.icon ? 26 : 13 }}
      onClick={onClick}
      aria-label={label}
    >
      {opts.icon ?? label}
    </button>
  );

  return (
    <div data-testid="void-edit" className="pos-abs" style={{ left: 0, top: 0, width: 1024, height: 768, background: '#fff', zIndex: 40 }}>
      <div className="pos-abs" style={{ left: 30, top: 14, width: 860, height: 740, border: '1px solid #c9ced8', background: '#fbfbfc', overflow: 'hidden' }}>
        {visible.map((r) => {
          const on = sel === r.key;
          return (
            <div
              key={r.key}
              data-testid={`voidedit-row-${r.qty}-${r.name}`}
              role="button"
              onClick={() => setSel(r.key)}
              style={{
                display: 'flex',
                alignItems: 'center',
                height: 60,
                borderBottom: '1px solid #c9ced8',
                background: on ? '#5b8de4' : r.pending ? '#fff' : '#eef0f4',
                color: on ? '#fff' : '#222',
                fontSize: 21,
                cursor: 'pointer',
              }}
            >
              <div style={{ width: 70, textAlign: 'right', paddingRight: 8, borderRight: '1px solid #b9bfca', height: '100%', lineHeight: '60px' }}>{r.qty}</div>
              <div style={{ flex: 1, paddingLeft: 10 }}>{r.name}</div>
              <div style={{ width: 230, textAlign: 'right', paddingRight: 12, borderLeft: '1px solid #b9bfca', height: '100%', lineHeight: '60px', fontSize: 19 }}>{fmt(r.amount)}</div>
            </div>
          );
        })}
      </div>
      {side('Plus', 40, 64, plus, { icon: '⊞' })}
      {side('Minus', 112, 64, minus, { icon: '⊟' })}
      {side('Cancel All', 184, 64, () => setDrafts({}))}
      {side('Apply', 256, 64, apply)}
      {side('Close', 328, 64, onClose, { blue: true })}
      {side('Up', 420, 64, () => setTop((t) => Math.max(0, t - 6)), { icon: '︿' })}
      {side('Down', 492, 64, () => setTop((t) => (t + 12 < rows.length ? t + 6 : t)), { icon: '﹀' })}
    </div>
  );
}

const ROWS: string[][] = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', 'Clear', '7', '8', '9'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Back', '4', '5', '6'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M', ',', '.', '▲', 'Delete', '1', '2', '3'],
  ['Upper', ' ', 'Home', 'End', '◀', '▼', '▶', '0', 'Enter'],
];
const WIDE: Record<string, number> = { Back: 2, ' ': 5, Enter: 2, Upper: 1 };

/** The reason keyboard shown before a void is added (up to 256 characters). */
function ReasonKeyboard({ close, onOk }: { close: () => void; onOk: (reason: string) => void }) {
  const [text, setText] = useState('');
  const [caret, setCaret] = useState(0);
  const [upper, setUpper] = useState(true);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const put = (s: string) => {
    const t = (text.slice(0, caret) + s + text.slice(caret)).slice(0, 256);
    setText(t);
    setCaret(Math.min(t.length, caret + s.length));
  };
  const ok = () => {
    if (!text.trim()) return dialogs.message('Please enter the reason for the void.', 'Void');
    close();
    onOk(text.trim());
  };
  const press = (k: string) => {
    if (k === 'Clear') return (setText(''), setCaret(0));
    if (k === 'Back') return caret > 0 && (setText(text.slice(0, caret - 1) + text.slice(caret)), setCaret(caret - 1));
    if (k === 'Delete') return setText(text.slice(0, caret) + text.slice(caret + 1));
    if (k === 'Upper') return setUpper((u) => !u);
    if (k === 'Home') return setCaret(0);
    if (k === 'End') return setCaret(text.length);
    if (k === '◀') return setCaret(Math.max(0, caret - 1));
    if (k === '▶') return setCaret(Math.min(text.length, caret + 1));
    if (k === '▲' || k === '▼') return;
    if (k === 'Enter') return ok();
    put(k.length === 1 && /[A-Z]/.test(k) && !upper ? k.toLowerCase() : k);
  };
  const keyStyle = (k: string) => ({
    position: 'static' as const,
    flex: WIDE[k] ?? 1,
    height: 52,
    fontSize: 15,
    background: /^[0-9]$|Enter/.test(k) ? '#a9adc4' : ['Clear', 'Back', 'Delete', 'Upper', 'Home', 'End'].includes(k) ? '#cdd1e4' : '#fafafa',
    color: /^[0-9]$|Enter/.test(k) ? '#fff' : '#333',
    border: '1px solid #d4d7de',
    fontWeight: k === 'Upper' && upper ? 'bold' : 'normal',
  });
  return (
    <>
      <div className="pos-modal-backdrop" />
      <div data-testid="reason-keyboard" className="pos-abs" style={{ left: 20, top: 30, width: 984, height: 700, background: '#f4f5f8', border: '1px solid #c3c8d2', zIndex: 60, boxShadow: '0 6px 30px rgba(0,0,0,.25)' }}>
        <textarea
          ref={ref}
          data-testid="reason-text"
          value={text}
          maxLength={256}
          onChange={(e) => {
            setText(e.target.value.slice(0, 256));
            setCaret(e.target.selectionStart ?? e.target.value.length);
          }}
          onSelect={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), ok())}
          placeholder="Reason for the void"
          style={{ position: 'absolute', left: 20, top: 20, width: 790, height: 200, fontSize: 22, padding: 12, border: '1px solid #b8bdc8', resize: 'none' }}
        />
        <button data-testid="reason-OK" className="pos-btn pos-btn-blue" style={{ left: 830, top: 20, width: 134, height: 80, fontSize: 18, fontWeight: 'bold', background: '#3b5ec0' }} onClick={ok}>
          OK
        </button>
        <button data-testid="reason-Close" className="pos-btn" style={{ left: 830, top: 112, width: 134, height: 80, fontSize: 18, color: '#fff', background: '#8ea6ec', border: 'none' }} onClick={close}>
          Close
        </button>
        <div className="pos-abs" style={{ left: 830, top: 200, width: 134, fontSize: 13, color: '#555', textAlign: 'center' }}>
          {text.length} / 256
        </div>
        <div className="pos-abs" style={{ left: 20, top: 400, width: 944, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {ROWS.map((row, i) => (
            <div key={i} style={{ display: 'flex', gap: 6 }}>
              {row.map((k) => (
                <button key={k} data-testid={`key-${k === ' ' ? 'space' : k}`} className="pos-btn" style={keyStyle(k)} onClick={() => press(k)}>
                  {k === ' ' ? '' : k}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export function reasonKeyboard(onOk: (reason: string) => void) {
  dialogs.custom((close) => <ReasonKeyboard close={close} onOk={onOk} />);
}
