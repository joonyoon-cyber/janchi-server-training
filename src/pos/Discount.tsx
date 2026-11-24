import { useState } from 'react';
import { checkTotals, discountOf, fmt, fromCents, toCents } from '../lib/money';
import { actions, getState } from '../lib/store';
import type { Check, CheckDiscount } from '../lib/types';
import { dialogs } from './common';
import { textKeyboard } from './VoidEdit';

/**
 * Discount on the order screen, as in the POS video (11/2026):
 * Discount -> type the note (e.g. JOON SELF) -> Ok -> the Discount panel (Discount Item,
 * Discount Line Item, Discount Order; Reason; Close) -> Discount Order -> the discount pad with
 * presets (<<10%>>, <<15%>>, <<20%>>, <<$5>>, <<$10>>, Emp Disc = 10%) -> Ok.
 */

const PRESETS: { name: string; kind: 'pct' | 'amt'; value: number }[] = [
  { name: '<<10%>>', kind: 'pct', value: 10 },
  { name: '<<15%>>', kind: 'pct', value: 15 },
  { name: '<<20%>>', kind: 'pct', value: 20 },
  { name: '<<$5>>', kind: 'amt', value: 5 },
  { name: '<<$10>>', kind: 'amt', value: 10 },
  { name: 'Emp Disc', kind: 'pct', value: 10 },
];

/** Discount button: the note keyboard first, then the Discount panel. */
export function startDiscount(open: (note: string) => void) {
  const c = currentCheck();
  textKeyboard({ title: 'Discount', max: 512, initial: c?.discount?.note ?? '' }, (note) => open(note));
}

function currentCheck(): Check | null {
  const s = getState();
  return s.activeCheckId ? s.checks[s.activeCheckId] ?? null : null;
}

export function DiscountPanel({ note, onClose }: { note: string; onClose: () => void }) {
  const [text, setText] = useState(note);
  const tile = (label: string, x: number, onClick: () => void) => (
    <button data-testid={`discount-${label}`} className="pos-btn" style={{ left: x, top: 62, width: 220, height: 70, fontSize: 15, background: '#fbfbfc' }} onClick={onClick}>
      {label}
    </button>
  );
  return (
    <div data-testid="discount-panel" className="pos-abs" style={{ left: 0, top: 62, width: 724, height: 588, background: '#e4e6ec', zIndex: 30, borderRight: '1px solid #c9ced8' }}>
      <div className="pos-abs" style={{ left: 18, top: 14, fontSize: 18, color: '#3c6fb8' }}>
        Discount
      </div>
      {tile('Discount Item', 20, () => dialogs.notInSimulator('Discount Item (one item)'))}
      {tile('Discount Line Item', 252, () => dialogs.notInSimulator('Discount Line Item (one line)'))}
      {tile('Discount Order', 484, () => discountPad(text, onClose))}
      <button data-testid="discount-Reason" className="pos-btn" style={{ left: 390, top: 476, width: 180, height: 66, fontSize: 15, background: '#fbfbfc' }} onClick={() => textKeyboard({ title: 'Discount', max: 512, initial: text }, setText)}>
        Reason
      </button>
      <button data-testid="discount-Close" className="pos-btn pos-btn-blue" style={{ left: 584, top: 476, width: 124, height: 66, fontSize: 15 }} onClick={onClose}>
        Close
      </button>
    </div>
  );
}

function discountPad(note: string, done: () => void) {
  dialogs.custom((close) => (
    <DiscountPad
      note={note}
      close={close}
      done={() => {
        close();
        done();
      }}
    />
  ));
}

function DiscountPad({ note, close, done }: { note: string; close: () => void; done: () => void }) {
  const c = currentCheck();
  const before = c ? checkTotals(c, getState().settings.taxRate, true).orderAmount : 0;
  const cur = c?.discount;
  const [digits, setDigits] = useState(cur ? String(Math.round(cur.value * 100)) : '');
  const [kind, setKind] = useState<'pct' | 'amt'>(cur?.kind ?? 'pct');
  const [name, setName] = useState(cur?.name ?? 'Custom');
  const value = (parseInt(digits || '0', 10) || 0) / 100;
  const off = fromCents(discountOf({ kind, value }, toCents(before)));
  const press = (k: string) => {
    if (k === 'Clear') return (setDigits(''), setName('Custom'));
    if (k === '%') return (setKind('pct'), setName('Custom'));
    if (k === 'Cash') return (setKind('amt'), setName('Custom'));
    setDigits((d) => (d + k).replace(/^0+/, '').slice(0, 7));
    setName('Custom');
  };
  const ok = () => {
    const d: CheckDiscount = { name, kind, value, note };
    actions.applyDiscount(d);
    done();
  };
  const row = (label: string, v: string, y: number, big = false) => (
    <div className="pos-abs" style={{ left: 24, top: y, width: 440, borderBottom: '1px solid #444', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingBottom: 6 }}>
      <span style={{ fontSize: 15 }}>{label}</span>
      <span style={{ fontSize: big ? 30 : 26, color: big ? '#3c6fd8' : label === 'After Discount' ? '#888' : '#222' }}>{v}</span>
    </div>
  );
  const KEYS = ['7', '8', '9', '%', '4', '5', '6', 'Cash', '1', '2', '3', 'Ok', '0', 'Clear', '00', 'Close'];
  return (
    <>
      <div className="pos-modal-backdrop" />
      <div data-testid="discount-pad" className="pos-abs" style={{ left: 150, top: 18, width: 860, height: 640, background: '#f4f5f8', border: '1px solid #c3c8d2', zIndex: 60, boxShadow: '0 6px 30px rgba(0,0,0,.25)' }}>
        <div className="pos-abs" style={{ left: 16, top: 10, fontSize: 18, color: '#3c6fb8' }}>
          Discount
        </div>
        {row('Before Discount', fmt(before), 70)}
        {row('Discount', value.toFixed(2), 170, true)}
        <div className="pos-abs" style={{ left: 24, top: 216, fontSize: 12, color: '#777' }}>
          {kind === 'pct' ? `${value.toFixed(2)}% off = ${fmt(off)}` : `$${value.toFixed(2)} off`}
          {name !== 'Custom' ? ` · ${name}` : ''}
        </div>
        {row('After Discount', fmt(before - off), 290)}
        {KEYS.map((k, i) => {
          const blue = k === 'Cash' || k === 'Ok' || k === 'Close';
          return (
            <button
              key={k}
              data-testid={`dpad-${k}`}
              className={`pos-btn ${blue ? 'pos-btn-blue' : ''}`}
              style={{
                left: 490 + (i % 4) * 90,
                top: 54 + Math.floor(i / 4) * 86,
                width: 84,
                height: 80,
                fontSize: 15,
                background: k === 'Ok' ? '#3b5ec0' : k === 'Cash' || k === 'Close' ? '#7e9df0' : (k === '%' && kind === 'pct') ? '#e3e9f7' : '#fafafa',
                color: blue ? '#fff' : k === '%' ? '#3c6fd8' : '#222',
              }}
              onClick={() => (k === 'Ok' ? ok() : k === 'Close' ? close() : press(k))}
            >
              {k}
            </button>
          );
        })}
        <div className="pos-abs" style={{ left: 16, top: 410, width: 828, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {PRESETS.map((p) => (
            <button
              key={p.name}
              data-testid={`dpreset-${p.name}`}
              className="pos-btn"
              style={{ position: 'static', height: 58, fontSize: 13, background: name === p.name ? '#6f8fe3' : '#fbfbfc', color: name === p.name ? '#fff' : '#333' }}
              onClick={() => {
                setKind(p.kind);
                setDigits(String(Math.round(p.value * 100)));
                setName(p.name);
              }}
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
