import { useEffect, type ReactNode } from 'react';
import { posItem, tableLabel } from '../lib/menu';
import { checkTotals, fmt, fromCents, toCents } from '../lib/money';
import { actions, getState, now, usePos } from '../lib/store';
import type { Check } from '../lib/types';
import { BluuLogo, DlgButton, HeaderClock, Modal, dialogs, formatLongTime } from './common';
import { IconCard, IconCash, IconCheckBadge, IconMinusBadge, IconPrinter, IconSearchPerson, IconTerminal } from './icons';
import { takePendingPayment } from './OrderScreen';

function balanceOf(): number {
  const s = getState();
  const c = s.activeCheckId ? s.checks[s.activeCheckId] : null;
  return c ? checkTotals(c, s.settings.taxRate).balance : 0;
}

export function cashFlow() {
  const bal = balanceOf();
  if (bal <= 0) return dialogs.message('This check has no balance.');
  const next = (step: number) => fromCents(Math.ceil(toCents(bal) / (step * 100)) * step * 100);
  const quick = [
    { label: `Exact ${fmt(bal)}`, value: fmt(bal) },
    { label: `$${next(1).toFixed(0)}`, value: String(next(1)) },
    ...[20, 50, 100].filter((v) => v > bal).map((v) => ({ label: `$${v}`, value: String(v) })),
  ];
  dialogs.keypad({
    title: 'Cash',
    subtitle: (
      <>
        Balance: <b>{fmt(bal)}</b> &mdash; enter cash received
      </>
    ),
    decimal: true,
    quick,
    onEnter: (v) => {
      const tendered = parseFloat(v);
      if (!tendered || tendered <= 0) return;
      const p = actions.pay('cash', tendered, tendered);
      if (!p) return;
      const remaining = balanceOf();
      dialogs.message(
        <div style={{ textAlign: 'center' }}>
          Cash received: {fmt(tendered)}
          <div style={{ fontSize: 30, fontWeight: 'bold', color: '#1c5bb8', margin: '10px 0' }}>Change: {fmt(Math.max(0, p.change ?? 0))}</div>
          {remaining > 0 && <div style={{ color: '#d0303a' }}>Remaining balance: {fmt(remaining)}</div>}
        </div>,
        'Cash Payment',
      );
    },
  });
}

export function creditFlow() {
  const bal = balanceOf();
  if (bal <= 0) return dialogs.message('This check has no balance.');
  dialogs.keypad({
    title: 'Credit Card',
    subtitle: (
      <>
        Balance: <b>{fmt(bal)}</b> &mdash; amount to charge
      </>
    ),
    decimal: true,
    initial: fmt(bal),
    onEnter: (v) => {
      const amt = parseFloat(v);
      if (!amt || amt <= 0) return;
      dialogs.custom((close) => (
        <Modal w={420} title="Credit Card">
          <div style={{ padding: 20, textAlign: 'center', fontSize: 15 }}>
            <IconTerminal size={56} />
            <div style={{ margin: '10px 0' }}>
              Amount: <b>{fmt(Math.min(amt, bal))}</b>
            </div>
            <div style={{ color: '#555', fontSize: 13 }}>Have the guest tap, insert, or swipe on the card terminal.</div>
            <div style={{ color: '#888', fontSize: 11, marginTop: 6 }}>Training simulator: no card data is collected or sent.</div>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: 14 }}>
            <DlgButton onClick={close}>Cancel</DlgButton>
            <DlgButton
              blue
              onClick={() => {
                close();
                const p = actions.pay('credit', amt);
                if (p) dialogs.message(<div style={{ textAlign: 'center', fontSize: 22, fontWeight: 'bold', color: '#2a8a3a' }}>APPROVED {fmt(p.amount)}</div>, 'Credit Card');
              }}
            >
              Card Approved
            </DlgButton>
          </div>
        </Modal>
      ));
    },
  });
}

function gratuityFlow(check: Check, subtotal: number) {
  const pct = (p: number) => fmt(fromCents(Math.round(toCents(subtotal) * p) / 100));
  dialogs.keypad({
    title: 'Gratuity',
    subtitle: <>Subtotal {fmt(subtotal)} &mdash; enter gratuity amount</>,
    decimal: true,
    initial: check.gratuity ? fmt(check.gratuity) : '',
    quick: [
      { label: '15%', value: pct(15) },
      { label: '18%', value: pct(18) },
      { label: '20%', value: pct(20) },
      { label: 'None', value: '0' },
    ],
    onEnter: (v) => actions.setGratuity(parseFloat(v) || 0),
  });
}

function Receipt({ check, taxRate }: { check: Check; taxRate: number }) {
  const t = checkTotals(check, taxRate);
  const row = (a: ReactNode, b: ReactNode, bold = false) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: bold ? 'bold' : 'normal' }}>
      <span>{a}</span>
      <span>{b}</span>
    </div>
  );
  return (
    <div style={{ fontFamily: 'Courier New, monospace', fontSize: 12.5, background: '#fff', padding: 14, border: '1px dashed #999', maxHeight: 440, overflowY: 'auto' }}>
      <div style={{ textAlign: 'center', fontWeight: 'bold' }}>JANCHI KOREAN BBQ</div>
      <div style={{ textAlign: 'center' }}>165 N. Moorpark Rd. Thousand Oaks</div>
      <div style={{ textAlign: 'center', marginBottom: 6 }}>** TRAINING - NOT A RECEIPT **</div>
      {row(`Table ${tableLabel(check.tableId)}`, `Check ${check.number}`)}
      {row(`Server ${check.server}`, `Guests ${check.guests}`)}
      <hr />
      {check.lines.map((l) => row(`${l.qty} ${posItem(l.posId).label}${l.modifier ? ` (${l.modifier})` : ''}`, fmt(l.qty * l.unitPrice)))}
      <hr />
      {row('Subtotal', fmt(t.subtotal))}
      {row('Tax', fmt(t.tax))}
      {t.gratuity > 0 && row('Gratuity', fmt(t.gratuity))}
      {row('TOTAL', fmt(t.totalDue), true)}
      {check.payments.map((p) => row(p.method === 'cash' ? `CASH ${fmt(p.tendered ?? p.amount)}` : 'CREDIT CARD', fmt(p.amount)))}
      {check.payments.filter((p) => p.change).map((p) => row('CHANGE', fmt(p.change ?? 0)))}
      {row('BALANCE', fmt(t.balance), true)}
      {t.gratuity === 0 && (
        <>
          <br />
          {row('Tip', '__________')}
          {row('Total', '__________')}
        </>
      )}
    </div>
  );
}

export function TenderScreen() {
  const checkId = usePos((s) => s.activeCheckId);
  const checks = usePos((s) => s.checks);
  const settings = usePos((s) => s.settings);
  const check = checkId ? checks[checkId] : null;

  useEffect(() => {
    const p = takePendingPayment();
    if (p === 'cash') cashFlow();
    if (p === 'credit') creditFlow();
  }, []);

  if (!check) return null;
  const t = checkTotals(check, settings.taxRate);
  const mins = Math.floor((now() - check.openedAt) / 60000);

  const payBtn = (label: string, x: number, y: number, icon: ReactNode, onClick: () => void) => (
    <div
      role="button"
      data-testid={`tender-${label}`}
      className="pos-btn"
      style={{ left: x, top: y, width: 160, height: 130, flexDirection: 'column', gap: 16, fontSize: 13.5, background: 'linear-gradient(#f4f5f7, #e6e8ec)' }}
      onClick={onClick}
    >
      {icon}
      {label}
    </div>
  );

  const rows: [string, string, boolean?][] = [
    ['Order Amount', fmt(t.orderAmount)],
    ['Discount', fmt(t.discount)],
    ['Surcharge', fmt(t.surcharge)],
    ['Subtotal', fmt(t.subtotal)],
    ['Tax', fmt(t.tax)],
    ['Amount Due', fmt(t.amountDue)],
    ['Gratuity', fmt(t.gratuity), true],
    ['Total Due', fmt(t.totalDue)],
    ['Total Received', fmt(t.totalReceived)],
  ];

  return (
    <div className="pos-screen" style={{ background: '#f4f6f7' }}>
      <div className="pos-header">
        <div className="pos-abs" style={{ left: 16, top: 15 }}>
          <BluuLogo height={34} />
        </div>
        <div className="pos-abs" data-testid="tender-table" style={{ left: 168, top: 22, fontSize: 17, color: '#3c6fb8', fontWeight: 'bold' }}>
          {tableLabel(check.tableId)}
        </div>
        <div className="pos-abs" style={{ left: 272, top: 22, fontSize: 17, color: '#3c6fb8', fontWeight: 'bold' }}>
          {check.number}
        </div>
        <div className="pos-abs" style={{ left: 380, top: 18 }}>
          <IconPrinter size={28} />
          <div className="pos-abs" style={{ left: 20, top: -4 }}>
            <IconCheckBadge size={13} />
          </div>
        </div>
        <div className="pos-abs" style={{ left: 432, top: 6, fontSize: 7, fontWeight: 'bold', color: '#333' }}>
          PARTIAL
        </div>
        <div className="pos-abs" style={{ left: 432, top: 16 }}>
          <IconCard size={30} />
          <div className="pos-abs" style={{ left: 22, top: 18 }}>
            <IconMinusBadge size={12} />
          </div>
        </div>
        <HeaderClock style={{ right: 14, top: 38 }} />
      </div>

      {payBtn('Cash', 9, 78, <IconCash size={44} />, cashFlow)}
      {payBtn('Credit Card', 176, 78, <IconCard size={44} />, creditFlow)}
      {payBtn('Offline C.C.', 511, 78, <IconTerminal size={44} />, () => dialogs.notInSimulator('Offline C.C.'))}
      {payBtn('Gift Card', 12, 216, <IconCash size={44} />, () => dialogs.notInSimulator('Gift Card payment'))}

      {check.payments.length > 0 && (
        <div className="pos-abs" data-testid="tender-payments" style={{ left: 196, top: 236, width: 300, fontSize: 13, color: '#333' }}>
          {check.payments.map((p) => (
            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #ccd', padding: '4px 2px' }}>
              <span>{p.method === 'cash' ? `Cash ${fmt(p.tendered ?? p.amount)}` : 'Credit Card'}</span>
              <span>{fmt(p.amount)}</span>
              {p.change ? <span style={{ color: '#1c5bb8' }}>Change {fmt(p.change)}</span> : <span />}
            </div>
          ))}
        </div>
      )}

      {/* Right summary panel */}
      <div className="pos-abs" style={{ left: 685, top: 78, width: 330, height: 62, background: 'linear-gradient(#4f84ea, #3a6fdc)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, fontWeight: 'bold', color: '#1b2540' }}>
        {tableLabel(check.tableId)}
      </div>
      <div className="pos-abs" style={{ left: 685, top: 148, width: 330, textAlign: 'center', fontSize: 12, color: '#2f5fb4', lineHeight: 1.6 }}>
        {formatLongTime(check.openedAt)} ~ {formatLongTime(now())}
        <br />({Math.floor(mins / 60)} Hour {mins % 60} Minute)
      </div>
      <div className="pos-abs" style={{ left: 692, top: 186, width: 316, fontSize: 14.5 }}>
        <div style={{ borderTop: '1px solid #bcc3cf', padding: '4px 6px', fontWeight: 'bold', color: '#222', display: 'flex', justifyContent: 'space-between' }}>
          <span>Server</span>
          <span style={{ fontWeight: 'normal' }}>{check.server}</span>
        </div>
        {rows.map(([label, value, link]) => (
          <div
            key={label}
            data-testid={`tender-row-${label}`}
            role={link ? 'button' : undefined}
            onClick={link ? () => gratuityFlow(check, t.subtotal) : undefined}
            style={{ borderTop: '1px solid #bcc3cf', padding: '4px 6px', display: 'flex', justifyContent: 'space-between', cursor: link ? 'pointer' : 'default' }}
          >
            <span style={{ fontWeight: 'bold', color: link ? '#3c6fd8' : '#222' }}>{label}</span>
            <span style={{ color: '#4a6fd0', fontSize: 15.5 }}>{value}</span>
          </div>
        ))}
        <div style={{ borderTop: '1px solid #bcc3cf', padding: '6px 6px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontWeight: 'bold', fontSize: 18 }}>Balance</span>
          <span data-testid="tender-balance" style={{ color: '#3a62c0', fontSize: 25, fontWeight: 'bold' }}>
            {fmt(t.balance)}
          </span>
        </div>
      </div>

      <button className="pos-btn" style={{ left: 675, top: 568, width: 105, height: 56, fontSize: 13 }} onClick={() => dialogs.notInSimulator('Total Amount')}>
        Total Amount
      </button>
      <button className="pos-btn" style={{ left: 785, top: 568, width: 50, height: 56, fontSize: 16 }} onClick={() => dialogs.notInSimulator('Scroll up')}>
        ︿
      </button>
      <button className="pos-btn" style={{ left: 840, top: 568, width: 50, height: 56, fontSize: 16 }} onClick={() => dialogs.notInSimulator('Scroll down')}>
        ﹀
      </button>
      <button
        className="pos-btn"
        style={{ left: 895, top: 568, width: 110, height: 56, fontSize: 13 }}
        onClick={() =>
          dialogs.custom((close) => (
            <Modal w={420} title={`Order Sum - ${tableLabel(check.tableId)}`}>
              <div style={{ padding: 12 }}>
                <Receipt check={check} taxRate={settings.taxRate} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 12px 12px' }}>
                <DlgButton onClick={close}>Close</DlgButton>
              </div>
            </Modal>
          ))
        }
      >
        Order Sum
      </button>
      <button data-testid="tender-Gratuity" className="pos-btn" style={{ left: 675, top: 633, width: 104, height: 105, fontSize: 15 }} onClick={() => gratuityFlow(check, t.subtotal)}>
        Gratuity
      </button>
      <button
        data-testid="tender-Print"
        className="pos-btn"
        style={{ left: 784, top: 633, width: 102, height: 105, fontSize: 15 }}
        onClick={() => {
          actions.print();
          dialogs.custom((close) => (
            <Modal w={400} title="Print (simulated)">
              <div style={{ padding: 12 }}>
                <Receipt check={check} taxRate={settings.taxRate} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 12px 12px' }}>
                <DlgButton blue onClick={close}>
                  OK
                </DlgButton>
              </div>
            </Modal>
          ));
        }}
      >
        Print
      </button>
      <button
        data-testid="tender-Close"
        className="pos-btn pos-btn-blue"
        style={{ left: 891, top: 633, width: 114, height: 105, fontSize: 15, background: 'linear-gradient(#5f93ea, #3b72dc)' }}
        onClick={() => {
          const r = actions.leaveTender();
          if (r === 'unpaid') dialogs.message(`This check still has a balance of ${fmt(t.balance)}. It stays open.`, 'Close');
        }}
      >
        Close
      </button>

      {/* Customer lookup strip (bottom left) */}
      <div className="pos-abs" style={{ left: 41, top: 675, width: 210, height: 66, border: '1px solid #c8ccd4', background: '#fafafa', fontSize: 10.5, color: '#666' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.2fr 0.7fr', textAlign: 'center', borderBottom: '1px solid #c8ccd4', padding: '3px 0' }}>
          <span>Customer</span>
          <span>
            Date Visited
            <br />
            Count Visited
          </span>
          <span>Point</span>
        </div>
      </div>
      <button className="pos-btn" style={{ left: 258, top: 672, width: 62, height: 68 }} onClick={() => dialogs.notInSimulator('Customer Search')}>
        <IconSearchPerson size={36} />
      </button>
      <button className="pos-btn" style={{ left: 330, top: 672, width: 92, height: 68, fontSize: 12.5 }} onClick={() => dialogs.notInSimulator('Even Amount Split')}>
        Even Amount
        <br />
        Split
      </button>
    </div>
  );
}
