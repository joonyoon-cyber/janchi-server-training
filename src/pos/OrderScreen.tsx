import { useEffect, useRef, useState } from 'react';
import { GRID_COLUMNS, GRID_ROWS, categories, itemsInCategory, posItem, tableLabel } from '../lib/menu';
import { checkTotals, fmt } from '../lib/money';
import { actions, getState, usePos } from '../lib/store';
import type { OrderLine } from '../lib/types';
import { BluuLogo, DlgButton, HeaderClock, Modal, ModText, dialogs } from './common';
import { IconCancelAll, IconForkSpoon, IconGuests, IconModifierBadge, IconPerson, IconVoidLine } from './icons';
import { modifierOptions } from './modifiers';

const GRID_X = 185;
const GRID_Y = 69;
const CELL_W = 133;
const CELL_H = 72.5;

/** Set by the order screen's Cash / Credit Card buttons; read by TenderScreen. */
export let pendingPayment: 'cash' | 'credit' | null = null;
export function takePendingPayment() {
  const p = pendingPayment;
  pendingPayment = null;
  return p;
}

function chooseModifier(lineId: string, posId: string) {
  const opts = modifierOptions(posId);
  if (!opts) return;
  dialogs.custom((close) => (
    <Modal w={460} title={`Modifier - ${posItem(posId).label}`}>
      <div style={{ padding: 12, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {opts.map((o) => (
          <button
            key={o}
            className="pos-btn"
            style={{ position: 'relative', height: 54, fontWeight: 'bold', fontSize: 13 }}
            onClick={() => {
              actions.setLineModifier(lineId, o);
              close();
            }}
          >
            {o}
          </button>
        ))}
      </div>
      <div style={{ padding: '0 12px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: '#666' }}>Choices from the Janchi menu. Real modifier screen not yet verified.</span>
        <DlgButton onClick={close}>Skip</DlgButton>
      </div>
    </Modal>
  ));
}

function requireManager(then: () => void) {
  const { settings } = getState();
  if (!settings.requireManagerForVoid) return then();
  dialogs.keypad({
    title: 'Manager Authorization',
    subtitle: 'Enter manager PIN to void an ordered item',
    onEnter: (pin) => (pin === settings.managerPin ? then() : dialogs.message('Invalid manager PIN.')),
  });
}

function voidLineFlow(line: OrderLine, qty?: number) {
  const name = posItem(line.posId).label;
  if (line.status === 'new') {
    if (qty === undefined || qty >= line.qty) actions.removeLine(line.id);
    else actions.setLineQty(line.id, line.qty - qty);
    return;
  }
  const n = qty ?? line.qty;
  dialogs.confirm(
    <>
      <b>{name}</b> has already been ordered.
      <br />
      Void {n} of {line.qty}?
    </>,
    () => requireManager(() => actions.voidSent(line.id, n)),
    'Void Ordered Item',
  );
}

export function OrderScreen() {
  const checkId = usePos((s) => s.activeCheckId);
  const checks = usePos((s) => s.checks);
  const settings = usePos((s) => s.settings);
  const check = checkId ? checks[checkId] : null;
  const [cat, setCat] = useState(categories[0].id);
  const [selected, setSelected] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const catRef = useRef<HTMLDivElement>(null);

  const lines = check?.lines ?? [];
  const selLine = lines.find((l) => l.id === selected) ?? null;

  useEffect(() => {
    // keep the newest line visible, like the real list
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [lines.length]);

  if (!check) return null;
  const totals = checkTotals(check, settings.taxRate, true);
  const inOrder = new Set(lines.map((l) => l.posId));
  const hasNew = lines.some((l) => l.status === 'new');

  const needLine = (fn: (l: OrderLine) => void) => () => {
    if (!selLine) return dialogs.message('Please select an item in Order Details first.');
    fn(selLine);
  };

  const onItem = (posId: string) => {
    const lineId = actions.addItem(posId);
    if (lineId) {
      setSelected(lineId);
      if (modifierOptions(posId)) chooseModifier(lineId, posId);
    }
  };

  const stepQty = (delta: number) =>
    needLine((l) => {
      if (l.status === 'sent') return dialogs.message('This item has already been ordered. Use Void/Edit to change it.');
      actions.setLineQty(l.id, l.qty + delta);
    })();

  const toPayment = (kind: 'cash' | 'credit' | null) => {
    if (hasNew) return dialogs.message('There are new items that have not been ordered. Press Order first.');
    if (!lines.length) return dialogs.message('There are no ordered items on this check.');
    pendingPayment = kind;
    actions.openTender(check.id);
  };

  const scroll = (el: HTMLDivElement | null, dy: number) => el?.scrollBy({ top: dy, behavior: 'smooth' });

  const btn = (label: string, x: number, y: number, w: number, h: number, onClick: () => void, cls = '') => (
    <button data-testid={`order-${label}`} className={`pos-btn ${cls}`} style={{ left: x, top: y, width: w, height: h }} onClick={onClick}>
      {label}
    </button>
  );

  return (
    <div className="pos-screen">
      {/* Header */}
      <div className="pos-header">
        <div className="pos-abs" style={{ left: 16, top: 15 }}>
          <BluuLogo height={34} />
        </div>
        <div className="pos-abs" style={{ left: 152, top: 17 }}>
          <IconForkSpoon size={28} color="#3c6fb8" />
        </div>
        <div className="pos-abs" data-testid="order-table" style={{ left: 186, top: 22, fontSize: 16, color: '#3c6fb8', fontWeight: 'bold' }}>
          {tableLabel(check.tableId)}
        </div>
        <div className="pos-header-sep" style={{ left: 270 }} />
        <div className="pos-abs" style={{ left: 284, top: 16 }}>
          <IconPerson size={30} />
        </div>
        <div className="pos-abs" style={{ left: 326, top: 24, fontSize: 13, width: 96, textAlign: 'center', overflow: 'hidden' }}>
          {check.server}
        </div>
        <div className="pos-header-sep" style={{ left: 427 }} />
        <div className="pos-abs" style={{ left: 440, top: 16 }}>
          <IconGuests size={30} />
        </div>
        <div className="pos-abs" data-testid="order-guests" style={{ left: 488, top: 24, fontSize: 14 }}>
          {check.guests}
        </div>
        <div className="pos-header-sep" style={{ left: 516 }} />
        <div className="pos-header-sep" style={{ left: 617 }} />
        <div className="pos-header-sep" style={{ left: 720 }} />
        <ModText style={{ right: 8, top: 10 }} />
        <HeaderClock style={{ right: 8, top: 40 }} />
      </div>

      {/* Menu groups */}
      <div ref={catRef} className="pos-abs" style={{ left: 0, top: 70, width: 182, height: 526, overflow: 'hidden' }}>
        {categories.map((c, i) => (
          <div
            key={c.id}
            role="button"
            data-testid={`cat-${c.id}`}
            className={`pos-cat ${c.id === cat ? 'selected' : ''}`}
            style={{ top: 2 + i * 37, background: `linear-gradient(${c.color}dd, ${c.color})` }}
            onClick={() => setCat(c.id)}
          >
            {c.label}
          </div>
        ))}
      </div>
      {btn('▲', 10, 606, 80, 42, () => scroll(catRef.current, -111))}
      {btn('▼', 94, 606, 80, 42, () => scroll(catRef.current, 111))}

      {/* Menu item grid */}
      <div className="pos-abs" style={{ left: GRID_X - 2, top: GRID_Y - 2, width: CELL_W * GRID_COLUMNS + 4, height: CELL_H * GRID_ROWS + 4, background: '#d7dbe6' }} />
      {itemsInCategory(cat).map((it) => (
        <div
          key={it.id}
          role="button"
          data-testid={`item-${it.id}`}
          className={`pos-item ${inOrder.has(it.id) ? 'in-order' : ''}`}
          style={{
            left: GRID_X + (it.col - 1) * CELL_W,
            top: GRID_Y + (it.row - 1) * CELL_H,
            width: CELL_W,
            height: CELL_H,
            background: it.color ?? undefined,
          }}
          onClick={() => onItem(it.id)}
        >
          <div>{it.label}</div>
          <div className="price">{fmt(it.price)}</div>
          {it.modifierIcon && (
            <div className="pos-abs" style={{ left: 3, bottom: 3 }}>
              <IconModifierBadge />
            </div>
          )}
        </div>
      ))}

      {/* Order details */}
      <div className="pos-abs" style={{ left: 720, top: 68, width: 302, height: 284, background: '#e3e6ee' }} />
      <div className="pos-abs" style={{ left: 726, top: 76, fontSize: 16, fontWeight: 'bold', color: '#222' }}>
        Order Details
      </div>
      {check.rounds > 0 && (
        <div className="pos-abs" style={{ right: 10, top: 76, fontSize: 15, fontWeight: 'bold', color: 'var(--pos-blue-text)' }}>
          Check {check.number}
        </div>
      )}
      <div className="pos-abs" style={{ left: 724, top: 98, width: 294, borderTop: '2px solid #b9bfca' }} />
      <div className="pos-abs" style={{ left: 726, top: 106, width: 290, fontSize: 11.5, color: '#333', display: 'grid', gridTemplateColumns: '28px 1fr 74px 46px' }}>
        <span>Qty</span>
        <span style={{ textAlign: 'center' }}>Product Name</span>
        <span style={{ textAlign: 'center' }}>Unit Price</span>
        <span style={{ textAlign: 'right' }}>Price</span>
      </div>
      <div className="pos-abs" style={{ left: 724, top: 122, width: 294, borderTop: '1px solid #b9bfca' }} />
      <div ref={listRef} data-testid="order-lines" className="pos-abs" style={{ left: 724, top: 124, width: 294, height: 226, overflowY: 'auto', overflowX: 'hidden' }}>
        {lines.map((l) => {
          const it = posItem(l.posId);
          const sel = l.id === selected;
          return (
            <div
              key={l.id}
              role="button"
              data-testid={`line-${l.posId}`}
              data-status={l.status}
              onClick={() => setSelected(l.id)}
              style={{
                display: 'grid',
                gridTemplateColumns: '24px 1fr 74px 44px',
                alignItems: 'center',
                padding: '3px 2px',
                minHeight: 30,
                fontSize: 11,
                color: '#222',
                cursor: 'pointer',
                background: sel ? 'var(--pos-selected-row)' : l.status === 'sent' ? 'var(--pos-sent-row)' : 'transparent',
                borderBottom: '1px solid #c3c8d2',
              }}
            >
              <span style={{ textAlign: 'center' }}>{l.qty}</span>
              <span style={{ lineHeight: 1.15 }}>
                {it.label}
                {l.modifier && <div style={{ color: '#2c4f9c' }}>&nbsp;- {l.modifier}</div>}
              </span>
              <span style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>@ {fmt(l.unitPrice)} / pc</span>
              <span style={{ textAlign: 'right' }}>{fmt(l.unitPrice * l.qty)}</span>
            </div>
          );
        })}
      </div>

      <button data-testid="order-Cancel All" className="pos-btn" style={{ left: 724, top: 355, width: 86, height: 44, flexDirection: 'column', fontSize: 11.5 }} onClick={() => (hasNew ? dialogs.confirm('Cancel all new (unordered) items?', () => actions.cancelAll(), 'Cancel All') : dialogs.message('There are no new items to cancel.'))}>
        <IconCancelAll size={20} />
        Cancel All
      </button>
      {btn('−', 820, 355, 50, 44, () => stepQty(-1), 'pos-btn-dark')}
      {btn('+', 877, 355, 50, 44, () => stepQty(1), 'pos-btn-dark')}
      <button data-testid="order-Void Line" className="pos-btn" style={{ left: 935, top: 355, width: 82, height: 44, flexDirection: 'column', fontSize: 11.5 }} onClick={needLine((l) => voidLineFlow(l))}>
        <IconVoidLine size={20} />
        Void Line
      </button>

      {/* Totals */}
      <div className="pos-abs" style={{ left: 724, top: 406, width: 236, height: 148, fontSize: 12.5, color: '#3d4a62' }}>
        <div className="pos-abs" style={{ left: 4, top: 6 }}>Discount</div>
        <div className="pos-abs" style={{ right: 4, top: 6, color: '#222' }}>{fmt(totals.discount)}</div>
        <div className="pos-abs" style={{ left: 4, top: 24 }}>Cash Discount</div>
        <div className="pos-abs" style={{ left: 0, top: 44, width: 236, borderTop: '1px solid #b9bfca' }} />
        <div className="pos-abs" style={{ left: 4, top: 56 }}>Subtotal</div>
        <div className="pos-abs" data-testid="order-subtotal" style={{ right: 4, top: 56, color: '#222' }}>{fmt(totals.subtotal)}</div>
        <div className="pos-abs" style={{ left: 0, top: 78, width: 236, borderTop: '1px solid #b9bfca' }} />
        <div className="pos-abs" style={{ left: 4, top: 88 }}>Tax</div>
        <div className="pos-abs" data-testid="order-tax" style={{ right: 4, top: 88, color: '#222' }}>{fmt(totals.tax)}</div>
        <div className="pos-abs" style={{ left: 0, top: 110, width: 236, borderTop: '1px solid #b9bfca' }} />
        <div className="pos-abs" style={{ left: 4, top: 124 }}>Amount Due</div>
        <div className="pos-abs" data-testid="order-amount-due" style={{ right: 4, top: 112, fontSize: 28, fontWeight: 'bold', color: 'var(--pos-blue-text)' }}>
          {fmt(totals.amountDue)}
        </div>
      </div>
      {btn('︿', 966, 408, 50, 70, () => scroll(listRef.current, -90))}
      {btn('﹀', 966, 482, 50, 70, () => scroll(listRef.current, 90))}

      {btn('Assign Seat', 726, 580, 84, 46, () => dialogs.notInSimulator('Assign Seat'))}
      {btn('−', 820, 580, 50, 46, () => dialogs.notInSimulator('Seat −'), 'pos-btn-dark')}
      {btn('+', 877, 580, 50, 46, () => dialogs.notInSimulator('Seat +'), 'pos-btn-dark')}
      <div role="button" className="pos-abs" style={{ left: 935, top: 584, width: 82, textAlign: 'center', fontSize: 12.5, cursor: 'pointer' }} onClick={() => dialogs.notInSimulator('Select Cust.')}>
        Select
        <br />
        Cust.
      </div>

      {/* Bottom action bar */}
      <button data-testid="order-Close" className="pos-btn pos-btn-blue" style={{ left: 22, top: 662, width: 102, height: 100, fontSize: 14 }} onClick={() => {
        const n = lines.filter((l) => l.status === 'new').length;
        if (n) dialogs.confirm(`${n} new item(s) have not been ordered and will be cancelled. Close anyway?`, () => actions.leaveOrderScreen(), 'Close');
        else actions.leaveOrderScreen();
      }}>
        Close
      </button>
      {btn('Modifier', 146, 665, 104, 44, needLine((l) => (modifierOptions(l.posId) && l.status === 'new' ? chooseModifier(l.id, l.posId) : dialogs.message('There are no modifiers for this item.'))))}
      {btn('Void / Edit', 257, 665, 105, 44, needLine((l) =>
        dialogs.keypad({
          title: 'Void / Edit',
          subtitle: (
            <>
              {posItem(l.posId).label} &mdash; qty {l.qty} ({l.status === 'sent' ? 'ordered' : 'new'})
              <br />
              Quantity to void:
            </>
          ),
          initial: String(l.qty),
          onEnter: (v) => {
            const n = parseInt(v, 10);
            if (!n || n < 1) return;
            voidLineFlow(l, Math.min(n, l.qty));
          },
        }),
      ))}
      {btn('Qty', 369, 665, 104, 44, needLine((l) => {
        if (l.status === 'sent') return dialogs.message('This item has already been ordered. Use Void/Edit to change it.');
        dialogs.keypad({ title: 'Qty', subtitle: posItem(l.posId).label, initial: String(l.qty), onEnter: (v) => actions.setLineQty(l.id, parseInt(v, 10) || 0) });
      }))}
      {btn('Split', 480, 665, 105, 44, () => dialogs.notInSimulator('Split'))}
      {btn('Combine', 592, 665, 106, 44, () => dialogs.notInSimulator('Combine'))}
      {btn('Price Change', 146, 715, 104, 41, () => dialogs.notInSimulator('Price Change'))}
      {btn('Discount', 257, 715, 105, 41, () => dialogs.notInSimulator('Discount'))}
      <button className="pos-btn" style={{ left: 369, top: 715, width: 104, height: 41, fontSize: 11.5 }} onClick={() => dialogs.notInSimulator('Input Customer Information')}>
        Input Customer Information
      </button>
      {btn('Kitchen Memo', 480, 715, 105, 41, () => dialogs.notInSimulator('Kitchen Memo'))}
      {btn('Last Receipt', 592, 715, 106, 41, () => dialogs.notInSimulator('Last Receipt'))}

      {btn('Cash', 725, 659, 91, 44, () => toPayment('cash'), 'pos-btn-blue')}
      {btn('Credit Card', 725, 707, 91, 44, () => toPayment('credit'), 'pos-btn-blue')}
      <button data-testid="order-Tender" className="pos-btn pos-btn-blue" style={{ left: 821, top: 656, width: 89, height: 95, fontSize: 15, background: 'linear-gradient(#6d97e6, #5181dc)' }} onClick={() => toPayment(null)}>
        Tender
      </button>
      <button data-testid="order-Order" className="pos-btn pos-btn-navy" style={{ left: 917, top: 654, width: 89, height: 97, fontSize: 15 }} onClick={() => actions.submitOrder()}>
        Order
      </button>
    </div>
  );
}
