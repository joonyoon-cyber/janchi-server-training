import { useRef, useState, type ReactNode } from 'react';
import { fmt } from '../lib/money';
import { actions, checkPlace, getState, usePos } from '../lib/store';
import type { Check, Payment } from '../lib/types';
import { BluuLogo, dialogs } from './common';
import { IconCard, IconCash, IconTerminal, IconTip } from './icons';

type PayFilter = 'all' | 'cash' | 'offline' | 'credit';
type Query = { kind: 'receipt'; value: string } | { kind: 'mine' } | { kind: 'tipped' } | { kind: 'business' } | null;

interface Row {
  check: Check;
  payment: Payment;
}

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
};
const mdy = (ms: number) => {
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
};
/** e.g. 2026110610025 for check 10-025 paid on 11/6/2026 (as on the reference photo). */
export const receiptNo = (r: Row) => `${ymd(r.payment.at)}${r.check.number.replace('-', '')}`;

/** Numeric pad shared by the receipt search and gratuity dialogs (BLUU layout). */
function Pad({ x, y, cell, onKey, onClose, onOk }: { x: number; y: number; cell: number; onKey: (k: string) => void; onClose: () => void; onOk: () => void }) {
  const keys = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '0', 'Clear', '00'];
  const g = cell + 5;
  return (
    <>
      {keys.map((k, i) => (
        <button
          key={k}
          data-testid={`pad-${k}`}
          className="pos-btn"
          style={{ left: x + (i % 3) * g, top: y + Math.floor(i / 3) * g, width: cell, height: cell, fontSize: k === 'Clear' ? 15 : 17, background: 'linear-gradient(#f4f5f2, #e9ebe7)' }}
          onClick={() => onKey(k)}
        >
          {k}
        </button>
      ))}
      <button data-testid="pad-close" className="pos-btn pos-btn-blue" style={{ left: x + 3 * g, top: y, width: cell, height: 2 * g - 5, fontSize: 15, background: 'linear-gradient(#5f8fea, #4677e0)' }} onClick={onClose}>
        Close
      </button>
      <button data-testid="pad-ok" className="pos-btn pos-btn-navy" style={{ left: x + 3 * g, top: y + 2 * g, width: cell, height: 2 * g - 5, fontSize: 15 }} onClick={onOk}>
        Ok
      </button>
    </>
  );
}

function ReceiptSearch({ close, onSearch }: { close: () => void; onSearch: (v: string) => void }) {
  const [v, setV] = useState('');
  return (
    <>
      <div className="pos-modal-backdrop" style={{ background: 'rgba(20,30,50,0.15)' }} />
      <div className="pos-modal" data-testid="receipt-search" style={{ left: 300, top: 112, width: 380, height: 520, background: '#f3f5f2', borderRadius: 2 }}>
        <div className="pos-abs" style={{ left: 0, top: 0, width: 378, height: 60, background: '#cbdde2', color: '#2a5cab', fontWeight: 'bold', fontSize: 17, padding: '20px 22px' }}>
          Receipt number
        </div>
        <div className="pos-abs" data-testid="receipt-search-value" style={{ left: 12, top: 66, width: 270, height: 50, textAlign: 'right', fontSize: 30, fontWeight: 'bold', padding: '4px 10px' }}>
          {v}
        </div>
        <div className="pos-abs" style={{ left: 284, top: 70, width: 1, height: 42, background: '#333' }} />
        <button className="pos-abs" aria-label="Backspace" style={{ left: 304, top: 76, border: 'none', background: 'transparent', cursor: 'pointer' }} onClick={() => setV((x) => x.slice(0, -1))}>
          <svg width="40" height="26" viewBox="0 0 40 26">
            <path d="M12 2h24a3 3 0 0 1 3 3v16a3 3 0 0 1-3 3H12L2 13z" fill="#c6cdd6" />
            <path d="M19 8l10 10M29 8 19 18" stroke="#fff" strokeWidth="3" />
          </svg>
        </button>
        <div className="pos-abs" style={{ left: 12, top: 120, width: 354, height: 2, background: '#222' }} />
        <Pad
          x={14}
          y={130}
          cell={84}
          onKey={(k) => setV((x) => (k === 'Clear' ? '' : (x + k).slice(0, 16)))}
          onClose={close}
          onOk={() => {
            close();
            onSearch(v);
          }}
        />
      </div>
    </>
  );
}

function ReceiptPrompt({ close, payment }: { close: () => void; payment: Payment }) {
  const line = (a: string, b: number) => (
    <div>
      {a} : {fmt(b)}
    </div>
  );
  const b = (label: string, x: number, bg: string) => (
    <button className="pos-btn" style={{ left: x, top: 300, width: 132, height: 54, color: '#fff', fontSize: 13, background: bg, borderColor: '#334' }} onClick={close}>
      {label}
    </button>
  );
  return (
    <>
      <div className="pos-modal-backdrop" style={{ background: 'rgba(20,30,50,0.2)', zIndex: 60 }} />
      <div className="pos-modal" data-testid="tip-receipt-prompt" style={{ left: 182, top: 150, width: 640, height: 380, zIndex: 61, background: '#dfe3e6', borderRadius: 2 }}>
        <div className="pos-abs" style={{ left: 0, top: 0, width: 638, height: 46, background: '#e9eef0', fontWeight: 'bold', fontSize: 18, color: '#2a4d8a', padding: '12px 22px' }}>
          Receipt
        </div>
        <div className="pos-abs" style={{ left: 0, top: 66, width: 638, textAlign: 'center', fontSize: 18, fontWeight: 'bold', lineHeight: 1.35 }}>
          {line('Subtotal', payment.amount)}
          {line('Pre Gratuity', 0)}
          {line('Gratuity', payment.tip ?? 0)}
          {line('Amount Due', payment.amount + (payment.tip ?? 0))}
          <div style={{ marginTop: 14 }}>Print Receipt?</div>
          <div style={{ marginTop: 12, fontSize: 16 }}>(All : Print Merchant Copy and Customer Copy)</div>
        </div>
        {b('All', 170, 'linear-gradient(#2f6cc9, #1c5bb8)')}
        {b('Merchant Copy', 306, 'linear-gradient(#5f8fea, #4677e0)')}
        {b('No', 442, 'linear-gradient(#6c7380, #5c6370)')}
      </div>
    </>
  );
}

/** Credit Gratuity dialog: type the tip the guest wrote on the signed merchant copy. */
function CreditGratuity({ close, row }: { close: () => void; row: Row }) {
  // Keypad entry is in cents, like the BLUU pads with a "00" key: 2,0,00 -> 20.00
  const [cents, setCents] = useState('');
  const [msg, setMsg] = useState('Please input the amount');
  const [prompt, setPrompt] = useState<Payment | null>(null);
  const amount = cents ? parseInt(cents, 10) / 100 : null;
  const label = (text: string, y: number) => (
    <div className="pos-abs" style={{ left: 18, top: y, width: 150, height: 46, background: 'linear-gradient(#4f84ea, #3a6fdc)', color: '#fff', fontWeight: 'bold', fontSize: 16, textAlign: 'center', lineHeight: '46px' }}>
      {text}
    </div>
  );
  const info = (k: string, v: ReactNode, y: number, right = false) => (
    <div className="pos-abs" style={{ left: 18, top: y, width: 340, height: 38, borderBottom: '1px solid #cfd5da', display: 'flex', alignItems: 'center', fontSize: 14 }}>
      <span style={{ width: 130, paddingLeft: 10, color: '#333' }}>{k}</span>
      <span style={{ flex: 1, textAlign: right ? 'right' : 'center', paddingRight: right ? 10 : 0, fontWeight: 'bold', fontSize: 16 }}>{v}</span>
    </div>
  );
  return (
    <>
      <div className="pos-modal-backdrop" style={{ background: 'rgba(20,30,50,0.2)' }} />
      <div className="pos-modal" data-testid="credit-gratuity" style={{ left: 100, top: 80, width: 800, height: 560, background: '#eef1f0', borderRadius: 2 }}>
        <div className="pos-abs" style={{ left: 0, top: 0, width: 798, height: 56, background: '#e3eaec', display: 'flex', alignItems: 'center', gap: 12, paddingLeft: 18, color: '#2a4d8a', fontWeight: 'bold', fontSize: 18 }}>
          <IconTip size={30} />
          Credit Card
        </div>
        {label('Gratuity', 74)}
        <div className="pos-abs" data-testid="gratuity-input" style={{ left: 168, top: 74, width: 190, height: 46, background: '#fff', border: '1px solid #9aa3b2', fontSize: 20, fontWeight: 'bold', textAlign: 'right', padding: '10px 10px' }}>
          {amount === null ? '' : fmt(amount)}
        </div>
        {label('Server', 126)}
        <div className="pos-abs" style={{ left: 168, top: 126, width: 190, height: 46, background: '#fff', border: '1px solid #9aa3b2', fontSize: 15, fontWeight: 'bold', textAlign: 'center', lineHeight: '44px' }}>
          {row.check.server.toUpperCase()}
        </div>
        <button className="pos-btn" style={{ left: 18, top: 178, width: 340, height: 40, fontSize: 13, background: 'linear-gradient(#c9d3e6, #b7c3dc)' }} onClick={() => dialogs.notInSimulator('Select Employee')}>
          Select Employee
        </button>
        {info('Total Charge', fmt(row.payment.amount), 230, true)}
        {info('Receipt No.', receiptNo(row), 270)}
        {info('Date / Time', mdy(row.payment.at), 310)}
        {info('Approval No.', row.payment.approvalNo ?? '', 350)}
        {info('Pre Gratuity', fmt(0), 390, true)}
        {info('Gratuity', fmt(row.payment.tip ?? 0), 430, true)}
        <Pad
          x={380}
          y={74}
          cell={86}
          onKey={(k) => setCents((x) => (k === 'Clear' ? '' : (x + k).replace(/^0+(?=\d)/, '').slice(0, 7)))}
          onClose={close}
          onOk={() => {
            if (amount === null) return setMsg('Please input the amount');
            actions.adjustTip(row.check.id, row.payment.id, amount);
            setPrompt({ ...row.payment, tip: amount });
          }}
        />
        <div className="pos-abs" style={{ left: 18, top: 488, width: 762, height: 46, background: '#cbdde2', display: 'flex', alignItems: 'center', gap: 12, paddingLeft: 16, color: '#2a4d8a', fontSize: 15 }}>
          <span style={{ border: '2px solid #2a4d8a', borderRadius: '50%', width: 24, height: 24, textAlign: 'center', lineHeight: '20px', fontWeight: 'bold' }}>!</span>
          {msg}
        </div>
      </div>
      {prompt && <ReceiptPrompt payment={prompt} close={close} />}
    </>
  );
}

/** Main screen > Tip Adjustments: find a credit payment and add the tip from the signed slip. */
export function TipAdjustScreen() {
  const checks = usePos((s) => s.checks);
  const currentUser = usePos((s) => s.currentUser);
  const settings = usePos((s) => s.settings);
  const today = mdy(Date.now() + getState().clockOffset);
  const [payFilter, setPayFilter] = useState<PayFilter>('all');
  const [query, setQuery] = useState<Query>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const body = useRef<HTMLDivElement>(null);

  const all: Row[] = Object.values(checks).flatMap((check) => check.payments.map((payment) => ({ check, payment })));
  const rows = all
    .filter(({ check, payment }) => {
      if (mdy(payment.at) !== today || !query) return false;
      if (payFilter === 'cash' && payment.method !== 'cash') return false;
      if (payFilter === 'credit' && payment.method !== 'credit') return false;
      if (payFilter === 'offline') return false; // offline cards are not simulated
      if (query.kind === 'receipt') return receiptNo({ check, payment }).endsWith(query.value) && query.value.length > 0;
      if (query.kind === 'mine') return check.server === (currentUser ?? settings.serverName);
      if (query.kind === 'tipped') return (payment.tip ?? 0) > 0;
      return true;
    })
    .sort((a, b) => a.payment.at - b.payment.at);
  const sel = rows.find((r) => r.payment.id === selected) ?? null;

  const typeBtn = (f: PayFilter, label: string, x: number, icon?: ReactNode) => (
    <button
      data-testid={`ta-type-${f}`}
      className={`pos-btn ${payFilter === f ? 'pos-btn-blue' : ''}`}
      style={{ left: x, top: 90, width: 108, height: 74, flexDirection: 'column', gap: 6, fontSize: 14, background: payFilter === f ? 'linear-gradient(#3f6fe8, #2a55d8)' : undefined }}
      onClick={() => setPayFilter(f)}
    >
      {icon}
      {label}
    </button>
  );
  const queryBtn = (label: string, x: number, w: number, q: () => void, testId: string) => (
    <button data-testid={testId} className="pos-btn" style={{ left: x, top: 177, width: w, height: 56, fontSize: 13.5, fontWeight: 'bold', color: '#2a4d8a', background: 'linear-gradient(#c3d0e6, #aebfdc)', borderColor: '#8fa2c4' }} onClick={q}>
      {label}
    </button>
  );
  const sideBtn = (label: string, y: number, onClick: () => void, testId?: string) => (
    <button data-testid={testId} className="pos-btn" style={{ left: 883, top: y, width: 124, height: 54, fontSize: 13, background: 'linear-gradient(#e6e9ec, #d3d8dd)' }} onClick={onClick}>
      {label}
    </button>
  );

  const cols: [string, number][] = [
    ['No.', 42], ['Receipt number', 98], ['Date / Time', 71], ['Payment Type', 108], ['Approval No', 69], ['TroutD', 66],
    ['Gratuity Employee', 107], ['Base Amount', 66], ['Pre Gratuity', 62], ['Gratuity', 62], ['Total', 75],
  ];
  const grid = cols.map(([, w]) => `${w}px`).join(' ');

  return (
    <div className="pos-screen" style={{ background: '#f2f5f4' }}>
      <div className="pos-header">
        <div className="pos-abs" style={{ left: 16, top: 15 }}>
          <BluuLogo height={34} />
        </div>
        <div className="pos-abs" style={{ left: 188, top: 20, fontSize: 19, fontWeight: 'bold', color: '#2f5a9c' }}>
          Tip Adjustments
        </div>
      </div>

      <div className="pos-abs" style={{ left: 23, top: 100, width: 113, height: 35, border: '1px solid #555', background: '#fff', fontSize: 16, fontWeight: 'bold', textAlign: 'center', lineHeight: '33px' }}>
        {today}
      </div>
      <div role="button" className="pos-abs" style={{ left: 146, top: 103, cursor: 'pointer' }} onClick={() => dialogs.notInSimulator('Calendar')}>
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="#445" strokeWidth="1.6">
          <rect x="3" y="5" width="22" height="20" rx="2" />
          <path d="M3 10h22M9 3v4M19 3v4M8 15h3M13 15h3M18 15h3M8 20h3M13 20h3" />
        </svg>
      </div>

      {typeBtn('all', 'All', 410)}
      {typeBtn('cash', 'Cash', 526, <IconCash size={30} />)}
      {typeBtn('offline', 'Offline C.C.', 640, <IconTerminal size={30} />)}
      {typeBtn('credit', 'Credit', 756, <IconCard size={30} />)}

      {queryBtn('My Order', 29, 161, () => setQuery({ kind: 'mine' }), 'ta-my-order')}
      {queryBtn('Tip Applied', 198, 163, () => setQuery({ kind: 'tipped' }), 'ta-tip-applied')}
      {queryBtn('Business Hours', 368, 159, () => setQuery({ kind: 'business' }), 'ta-business')}
      {queryBtn('Search By Employee', 535, 161, () => dialogs.notInSimulator('Search By Employee'), 'ta-employee')}
      {queryBtn('Search With Receipt Number', 704, 157, () => dialogs.custom((close) => <ReceiptSearch close={close} onSearch={(v) => { setSelected(null); setQuery({ kind: 'receipt', value: v }); }} />), 'ta-receipt-search')}

      {/* Results table */}
      <div className="pos-abs" style={{ left: 32, top: 238, width: 829, height: 492, border: '1px solid #8f9aaa', background: '#f8faf9' }}>
        <div style={{ display: 'grid', gridTemplateColumns: grid, height: 53, borderBottom: '1px solid #8f9aaa', background: '#eef1f2', fontSize: 12.5, color: '#222', textAlign: 'center' }}>
          {cols.map(([h]) => (
            <div key={h} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', borderRight: '1px solid #c3c9d3', padding: '0 2px' }}>
              {h}
            </div>
          ))}
        </div>
        <div ref={body} data-testid="ta-rows" style={{ height: 437, overflowY: 'auto' }}>
          {rows.map((r, i) => {
            const on = r.payment.id === selected;
            const tip = r.payment.tip ?? 0;
            const cell = (v: ReactNode, align: 'center' | 'right' | 'left' = 'center') => (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: align === 'right' ? 'flex-end' : align === 'left' ? 'flex-start' : 'center', padding: '0 4px', textAlign: align, borderRight: '1px solid rgba(0,0,0,0.12)' }}>{v}</div>
            );
            return (
              <div
                key={r.payment.id}
                role="button"
                data-testid={`ta-row-${receiptNo(r)}`}
                onClick={() => setSelected(r.payment.id)}
                style={{ display: 'grid', gridTemplateColumns: grid, height: 58, fontSize: 11.5, cursor: 'pointer', background: on ? '#1f56c8' : i % 2 ? '#f1f3f6' : '#fff', color: on ? '#fff' : '#222', borderBottom: '1px solid #c3c9d3' }}
              >
                {cell(i + 1)}
                {cell(
                  <span>
                    {receiptNo(r)}
                    <br />
                    {checkPlace(r.check)}
                  </span>,
                )}
                {cell(mdy(r.payment.at))}
                {cell(r.payment.method === 'credit' ? <span>Credit Card<br />(...XXXX{r.payment.cardLast4})</span> : 'Cash')}
                {cell(r.payment.approvalNo ?? '')}
                {cell(r.payment.troutD ?? '')}
                {cell(r.check.server.toUpperCase(), 'left')}
                {cell(fmt(r.payment.amount), 'right')}
                {cell(fmt(0), 'right')}
                {cell(fmt(tip), 'right')}
                {cell(fmt(r.payment.amount + tip), 'right')}
              </div>
            );
          })}
        </div>
      </div>

      {sideBtn('Cash Gratuity', 77, () => dialogs.notInSimulator('Cash Gratuity'))}
      {sideBtn(
        'Credit Gratuity',
        145,
        () => {
          if (!sel) return dialogs.message('Please select a payment first.', 'Credit Gratuity');
          if (sel.payment.method !== 'credit') return dialogs.message('The selected payment is not a credit card payment.', 'Credit Gratuity');
          dialogs.custom((close) => <CreditGratuity close={close} row={sel} />);
        },
        'ta-credit-gratuity',
      )}
      {sideBtn('Offline C.C. Gratuity', 211, () => dialogs.notInSimulator('Offline C.C. Gratuity'))}
      {sideBtn('Flexgift Gratuity', 277, () => dialogs.notInSimulator('Flexgift Gratuity'))}
      {sideBtn('Reprint', 341, () => dialogs.notInSimulator('Reprint'))}
      <button data-testid="ta-close" className="pos-btn pos-btn-navy" style={{ left: 883, top: 529, width: 124, height: 50, fontSize: 14 }} onClick={() => actions.goto('main')}>
        Close
      </button>
      {sideBtn('︿', 590, () => body.current?.scrollBy({ top: -116, behavior: 'smooth' }))}
      {sideBtn('﹀', 650, () => body.current?.scrollBy({ top: 116, behavior: 'smooth' }))}
    </div>
  );
}
