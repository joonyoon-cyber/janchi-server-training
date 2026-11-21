import { useEffect, useState, type ReactNode } from 'react';
import { posItem } from '../lib/menu';
import { checkTotals, fmt, toCents } from '../lib/money';
import { actions, checkPlace, currentShare, dueNow, evenSplit, getState, isTakeout, now, usePos } from '../lib/store';
import type { Check, Payment } from '../lib/types';
import { BluuLogo, DlgButton, HeaderClock, Modal, dialogs, formatLongTime } from './common';
import { IconCard, IconCash, IconCheckBadge, IconMinusBadge, IconPrinter, IconSearchPerson, IconTerminal } from './icons';
import { bluuPad } from './LoginPad';
import { takePendingPayment } from './OrderScreen';

function balanceOf(): number {
  const s = getState();
  const c = s.activeCheckId ? s.checks[s.activeCheckId] : null;
  return c ? checkTotals(c, s.settings.taxRate).balance : 0;
}

/** Amount for the next payment: the chosen (or next) unpaid split share, or the balance. */
function dueOf(): number {
  const s = getState();
  const c = s.activeCheckId ? s.checks[s.activeCheckId] : null;
  return c ? dueNow(c, s.settings.taxRate) : 0;
}

/** " (Split 2 of 3)" while an even split is being paid. */
function splitNote(): string {
  const s = getState();
  const c = s.activeCheckId ? s.checks[s.activeCheckId] : null;
  const i = c ? currentShare(c) : -1;
  return c?.splits && i >= 0 ? ` (Split ${i + 1} of ${c.splits.length})` : '';
}

/** "Even Amount Split" result window, as on the POS: one line per share, Print & Apply / Close / Apply. */
function SplitAmounts({ close, ways }: { close: () => void; ways: number }) {
  const amounts = evenSplit(balanceOf(), ways);
  const apply = (print: boolean) => {
    close();
    actions.splitEvenly(ways);
    if (print) actions.print();
  };
  const b = (label: string, bg: string, onClick: () => void) => (
    <button
      data-testid={`split-${label}`}
      className="pos-btn"
      style={{ position: 'static', width: 108, height: 40, fontSize: 12.5, fontWeight: 'bold', color: '#fff', border: 'none', background: bg }}
      onClick={onClick}
    >
      {label}
    </button>
  );
  return (
    <Modal w={540} title="Even Amount Split">
      <div data-testid="split-amounts" style={{ padding: '46px 18px 36px', fontSize: 19, fontWeight: 'bold', textAlign: 'center', lineHeight: 1.35, color: '#222', maxHeight: 360, overflowY: 'auto' }}>
        {amounts.map((a, i) => (
          <div key={i}>
            Split Amount {i + 1}: {fmt(a)}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, justifyContent: 'center', padding: '0 14px 16px' }}>
        {b('Print & Apply', '#3b5ec0', () => apply(true))}
        {b('Close', '#8ea6ec', close)}
        {b('Apply', '#9aa0aa', () => apply(false))}
      </div>
    </Modal>
  );
}

function evenSplitFlow() {
  if (balanceOf() <= 0) return dialogs.message('This check has no balance.');
  bluuPad('Please enter the number of customers', 'split', (v) => {
    const n = parseInt(v, 10);
    if (!n || n < 1) return dialogs.message('Please enter the number of customers.', 'Even Amount Split');
    if (toCents(balanceOf()) < n) return dialogs.message('The balance is too small to split that many ways.', 'Even Amount Split');
    dialogs.custom((close) => <SplitAmounts close={close} ways={n} />);
  });
}

/** Change window: Close, or it disappears by itself after a few seconds (as on the POS). */
function ChangeWindow({ close, tendered, change, remaining }: { close: () => void; tendered: number; change: number; remaining: number }) {
  useEffect(() => {
    const id = setTimeout(close, 4000);
    return () => clearTimeout(id);
  }, [close]);
  return (
    <Modal w={420} title="Cash Payment">
      <div data-testid="cash-change" style={{ padding: '18px 18px 8px', textAlign: 'center', fontSize: 15 }}>
        Cash received: {fmt(tendered)}
        <div style={{ fontSize: 30, fontWeight: 'bold', color: '#1c5bb8', margin: '10px 0' }}>Change: {fmt(Math.max(0, change))}</div>
        {remaining > 0 && <div style={{ color: '#d0303a' }}>Remaining balance: {fmt(remaining)}</div>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: 14 }}>
        <DlgButton blue onClick={close}>
          Close
        </DlgButton>
      </div>
    </Modal>
  );
}

export function cashFlow() {
  const bal = dueOf();
  if (bal <= 0) return dialogs.message('This check has no balance.');
  dialogs.keypad({
    title: 'Cash',
    subtitle: (
      <>
        {splitNote() ? 'Amount due' : 'Balance'}: <b>{fmt(bal)}</b>
        {splitNote()} &mdash; enter cash received
      </>
    ),
    money: true,
    onEnter: (v) => {
      const tendered = parseFloat(v);
      if (!tendered || tendered <= 0) return;
      const p = actions.pay('cash', tendered, tendered);
      if (!p) return;
      const remaining = balanceOf();
      dialogs.custom((close) => (
        <ChangeWindow
          tendered={tendered}
          change={p.change ?? 0}
          remaining={remaining}
          close={() => {
            close();
            // Paid in full: the check closes and the POS returns to Dine-in (or main for takeout).
            if (balanceOf() <= 0 && getState().screen === 'tender') actions.leaveTender();
          }}
        />
      ));
    },
  });
}

function CardSlip({ check, payment, copy }: { check: Check; payment: Payment; copy: 'MERCHANT COPY' | 'CUSTOMER COPY' }) {
  const row = (a: ReactNode, b: ReactNode, bold = false) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: bold ? 'bold' : 'normal' }}>
      <span>{a}</span>
      <span>{b}</span>
    </div>
  );
  return (
    <div data-testid={`card-slip-${copy === 'MERCHANT COPY' ? 'merchant' : 'customer'}`} style={{ fontFamily: 'Courier New, monospace', fontSize: 12, background: '#fff', padding: 12, border: '1px dashed #999', width: 236 }}>
      <div style={{ textAlign: 'center', fontWeight: 'bold' }}>JANCHI KOREAN BBQ</div>
      <div style={{ textAlign: 'center' }}>** TRAINING **</div>
      <div style={{ textAlign: 'center', margin: '4px 0' }}>{formatLongTime(payment.at)}</div>
      {row(checkPlace(check), `Chk ${check.number}`)}
      {row('Server', check.server)}
      <hr />
      {row('CREDIT SALE', '')}
      {row('Card', `CONTACTLESS ...${payment.cardLast4 ?? ''}`)}
      {row('Approval', payment.approvalNo ?? 'APPROVED')}
      <hr />
      {(payment.preGratuity ?? 0) > 0 && row('Incl. 18% gratuity', fmt(payment.preGratuity ?? 0))}
      {row('AMOUNT', fmt(payment.amount), true)}
      <br />
      {row('TIP', '__________')}
      <br />
      {row('TOTAL', '__________')}
      {copy === 'MERCHANT COPY' && (
        <>
          <br />
          <div>X_________________________</div>
          <div style={{ textAlign: 'center', fontSize: 10 }}>SIGNATURE</div>
        </>
      )}
      <div style={{ textAlign: 'center', fontWeight: 'bold', marginTop: 6 }}>{copy}</div>
    </div>
  );
}

function CardReader({ close }: { close: () => void }) {
  const [stage, setStage] = useState<'tap' | 'processing'>('tap');
  const bal = dueOf();
  const note = splitNote();
  const tap = () => {
    setStage('processing');
    setTimeout(() => {
      close();
      const p = actions.pay('credit', bal);
      const s = getState();
      const check = s.activeCheckId ? s.checks[s.activeCheckId] : null;
      if (!p || !check) return;
      actions.print();
      dialogs.custom((done) => (
        <Modal w={560} title="Credit Card - Approved (receipts printed)">
          <div style={{ padding: 12, display: 'flex', gap: 12, justifyContent: 'center' }}>
            <CardSlip check={check} payment={p} copy="MERCHANT COPY" />
            <CardSlip check={check} payment={p} copy="CUSTOMER COPY" />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 12px 12px' }}>
            <DlgButton
              blue
              onClick={() => {
                done();
                // Paid in full: the check closes and the POS returns to the Dine-in screen.
                if (balanceOf() <= 0) actions.leaveTender();
              }}
            >
              OK
            </DlgButton>
          </div>
        </Modal>
      ));
    }, 900);
  };
  return (
    <Modal w={420} title="Credit Card">
      <div style={{ padding: 20, textAlign: 'center', fontSize: 15 }}>
        <IconTerminal size={56} />
        <div style={{ margin: '10px 0' }}>
          Amount: <b>{fmt(bal)}</b>
          {note}
        </div>
        {stage === 'tap' ? (
          <div style={{ color: '#555', fontSize: 13 }}>Have the guest tap their card on the card reader.</div>
        ) : (
          <div style={{ color: '#1c5bb8', fontSize: 14, fontWeight: 'bold' }}>Processing...</div>
        )}
        <div style={{ color: '#888', fontSize: 11, marginTop: 6 }}>Training simulator: no card data is collected or sent.</div>
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: 14 }}>
        <DlgButton onClick={close} style={{ visibility: stage === 'tap' ? 'visible' : 'hidden' }}>
          Cancel
        </DlgButton>
        <DlgButton blue onClick={tap} style={{ visibility: stage === 'tap' ? 'visible' : 'hidden' }}>
          Tap Card on Reader
        </DlgButton>
      </div>
    </Modal>
  );
}

/** Credit Card: the guest taps the card on the reader for the balance; merchant and customer copies print. */
export function creditFlow() {
  if (balanceOf() <= 0) return dialogs.message('This check has no balance.');
  dialogs.custom((close) => <CardReader close={close} />);
}

/** The manual Gratuity button is disabled: the 18% party tip is automatic and tips go in Tip Adjustments. */
function gratuityDisabled() {
  dialogs.message(
    <>
      Gratuity is disabled in the simulator.
      <br />
      The 18% tip for parties of 5 or more is added automatically, and tips from signed card slips are entered in <b>Tip Adjustments</b>.
    </>,
    'Gratuity',
  );
}

export function Receipt({ check, taxRate }: { check: Check; taxRate: number }) {
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
      {row(isTakeout(check) ? 'Take out' : `Table ${checkPlace(check)}`, `Check ${check.number}`)}
      {row(`Server ${check.server}`, `Guests ${check.guests}`)}
      <hr />
      {check.lines.map((l) => row(`${l.qty} ${posItem(l.posId).label}${l.modifier ? ` (${l.modifier})` : ''}`, fmt(l.qty * l.unitPrice)))}
      <hr />
      {row('Subtotal', fmt(t.subtotal))}
      {row('Tax', fmt(t.tax))}
      {t.autoTip > 0 && row('Gratuity 18% (party of 5+)', fmt(t.autoTip))}
      {t.gratuity - t.autoTip > 0.001 && row('Gratuity', fmt(t.gratuity - t.autoTip))}
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
  const takeout = isTakeout(check);
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
          {takeout ? 'Take Out' : checkPlace(check)}
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

      {check.splits && (
        // After Apply, the shares sit as tiles at the bottom left (as on the POS). Tap one to pay it next
        // (they are the same amount); a share disappears once it is paid (confirmed from a POS photo, 11/2026).
        <div className="pos-abs" data-testid="tender-splits" style={{ left: 41, top: check.splits.length > 8 ? 548 : 606, width: 640, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {check.splits.map((x, i) => {
            if (x <= 0) return null;
            const chosen = i === currentShare(check);
            return (
              <div
                key={i}
                role="button"
                data-testid={`split-tile-${i + 1}`}
                title={`Split ${i + 1}: tap to pay this share next`}
                onClick={() => actions.selectShare(i)}
                style={{
                  width: 74,
                  height: 58,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  border: `1px solid ${chosen ? '#4677d8' : '#d4d8e0'}`,
                  boxShadow: chosen ? 'inset 0 0 0 1px #4677d8' : undefined,
                  background: chosen ? '#e6eefb' : '#f7f8fa',
                  color: '#4f74c4',
                  fontSize: 16,
                }}
              >
                {fmt(x)}
              </div>
            );
          })}
        </div>
      )}
      {check.payments.length > 0 && (
        <div className="pos-abs" data-testid="tender-payments" style={{ left: 196, top: 236, width: 300, fontSize: 13, color: '#333' }}>
          {check.payments.map((p) => (
            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #ccd', padding: '4px 2px' }}>
              {/* A card payment shows as a card icon and its amount (as on the POS). */}
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {p.method === 'cash' ? `Cash ${fmt(p.tendered ?? p.amount)}` : <IconCard size={22} />}
              </span>
              <span style={{ fontSize: p.method === 'cash' ? 13 : 16 }}>{fmt(p.amount)}</span>
              {p.change ? <span style={{ color: '#1c5bb8' }}>Change {fmt(p.change)}</span> : <span />}
            </div>
          ))}
        </div>
      )}

      {/* Right summary panel. Takeout (Quick Serve) shows the item list instead of the table banner. */}
      {takeout ? (
        <>
          <div className="pos-abs" data-testid="tender-takeout-items" style={{ left: 692, top: 78, width: 322, height: 296, border: '1px solid #bcc3cf', background: '#f7f9fa' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '34px 1fr 74px 52px', fontSize: 11.5, color: '#333', textAlign: 'center', padding: '6px 0', borderBottom: '1px solid #bcc3cf' }}>
              <span>Qty</span>
              <span>Menu Name</span>
              <span>Unit Price</span>
              <span>Price</span>
            </div>
            <div style={{ height: 262, overflowY: 'auto' }}>
              {check.lines.map((l) => (
                <div key={l.id} style={{ display: 'grid', gridTemplateColumns: '34px 1fr 74px 52px', fontSize: 11, padding: '4px 0', background: '#dfe5ee', borderBottom: '1px solid #c8ced8' }}>
                  <span style={{ textAlign: 'center' }}>{l.qty}</span>
                  <span>{posItem(l.posId).label}</span>
                  <span style={{ textAlign: 'center' }}>@ {fmt(l.unitPrice)} / pc</span>
                  <span style={{ textAlign: 'right', paddingRight: 4 }}>{fmt(l.qty * l.unitPrice)}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="pos-abs" style={{ left: 692, top: 380, width: 316, fontSize: 14.5 }}>
        {rows.filter(([label]) => ['Amount Due', 'Gratuity', 'Total Due', 'Total Received'].includes(label)).map(([label, value, link]) => (
          <div
            key={label}
            data-testid={`tender-row-${label}`}
            role={link ? 'button' : undefined}
            onClick={link ? gratuityDisabled : undefined}
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
        </>
      ) : (
        <>
      <div className="pos-abs" style={{ left: 685, top: 78, width: 330, height: 62, background: 'linear-gradient(#4f84ea, #3a6fdc)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, fontWeight: 'bold', color: '#1b2540' }}>
        {checkPlace(check)}
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
            onClick={link ? gratuityDisabled : undefined}
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
        </>
      )}

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
            <Modal w={420} title={`Order Sum - ${checkPlace(check)}`}>
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
      <button data-testid="tender-Gratuity" className="pos-btn" style={{ left: 675, top: 633, width: 104, height: 105, fontSize: 15 }} onClick={gratuityDisabled}>
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
      <button className="pos-btn" style={{ left: 330, top: 672, width: 92, height: 68, fontSize: 12.5 }} data-testid="tender-even-split" onClick={evenSplitFlow}>
        Even Amount
        <br />
        Split
      </button>
    </div>
  );
}
