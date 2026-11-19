import { useState } from 'react';
import { sections, tableLabel } from '../lib/menu';
import { checkTotals, fmt } from '../lib/money';
import { actions, usePos } from '../lib/store';
import type { Check, TableDef } from '../lib/types';
import { BluuLogo, DlgButton, HeaderClock, Modal, dialogs, formatClock, useNow } from './common';
import { IconCheckBadge, IconForkSpoon, IconMinusBadge, IconPerson, IconPrinter, IconReceiptDollar } from './icons';
import { Receipt } from './TenderScreen';

function elapsed(ms: number) {
  const m = Math.max(0, Math.floor(ms / 60000));
  return m < 60 ? String(m) : `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

function TableTile({ t, check, taxRate, nowMs, onClick }: { t: TableDef; check?: Check; taxRate: number; nowMs: number; onClick: () => void }) {
  const busy = !!check;
  const small = t.w < 90;
  return (
    <div
      role="button"
      data-testid={`table-${t.id}`}
      onClick={onClick}
      className="pos-abs"
      style={{
        left: t.x,
        top: t.y,
        width: t.w,
        height: t.h,
        background: busy ? 'var(--table-busy)' : 'var(--table-free)',
        border: `1px solid ${busy ? '#6aa7ad' : '#a9b04c'}`,
        cursor: 'pointer',
        fontFamily: 'var(--pos-font)',
      }}
    >
      <div style={{ textAlign: busy ? 'center' : small ? 'left' : 'center', paddingLeft: small && !busy ? 6 : 0, fontSize: 18, marginTop: 4, color: '#111' }}>{t.label}</div>
      {check && check.tableId !== t.id && (
        <div className="pos-abs" style={{ left: 0, top: 34, width: '100%', textAlign: 'center', fontSize: 13, color: '#333' }}>
          with {check.tableId}
        </div>
      )}
      {check && check.tableId === t.id && (
        <>
          <div className="pos-abs" style={{ left: 4, top: 30, fontSize: 12, color: '#3e9b3e' }}>
            {formatClock(check.openedAt)}
          </div>
          <div className="pos-abs" style={{ right: 4, top: 30, fontSize: 12, color: '#a040b8' }}>
            {elapsed(nowMs - check.openedAt)}
          </div>
          <div className="pos-abs" style={{ right: 4, top: 44, fontSize: 13, color: '#333', maxWidth: t.w - 8, overflow: 'hidden', whiteSpace: 'nowrap' }}>
            {check.server.split(' ')[0].toUpperCase()}
          </div>
          <div className="pos-abs" style={{ left: 6, bottom: 4, fontSize: 16, color: '#3b3bd0' }}>
            {check.guests}
          </div>
          <div className="pos-abs" style={{ right: 4, bottom: 3, fontSize: 18, color: '#e0303a' }}>
            {fmt(checkTotals(check, taxRate).balance)}
          </div>
        </>
      )}
    </div>
  );
}

export function FloorScreen() {
  const section = usePos((s) => s.section);
  const checks = usePos((s) => s.checks);
  const tableChecks = usePos((s) => s.tableChecks);
  const settings = usePos((s) => s.settings);
  const currentUser = usePos((s) => s.currentUser);
  const nowMs = useNow(15000);
  const [tenderMode, setTenderMode] = useState(false);
  // Printer icon: tap to arm (red badge -> green check), then tap a table to print its check.
  const [printMode, setPrintMode] = useState(false);
  // Move/Join: tap the table to move, then where it goes (null = waiting for the first table).
  const [moveMode, setMoveMode] = useState<{ from: string | null } | null>(null);
  const sec = sections.find((s) => s.id === section) ?? sections[0];

  /** A BLUU-style question with a row of buttons (Move / Join / Cancel, Change Server / …). */
  const ask = (title: string, text: string, buttons: { label: string; tone: 'dark' | 'light' | 'grey'; onClick?: () => void }[]) =>
    dialogs.custom((close) => (
      <Modal w={600} title={title}>
        <div data-testid="pos-choice" style={{ padding: '60px 24px 40px', textAlign: 'center', fontSize: 19, fontWeight: 'bold', color: '#222' }}>
          {text}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, padding: '0 16px 18px' }}>
          {buttons.map((b) => (
            <button
              key={b.label}
              data-testid={`choice-${b.label}`}
              className="pos-btn"
              style={{
                position: 'static',
                width: 128,
                height: 46,
                fontSize: 14,
                fontWeight: 'bold',
                color: '#fff',
                border: 'none',
                background: b.tone === 'dark' ? '#3b5ec0' : b.tone === 'light' ? '#8ea6ec' : '#9aa0aa',
              }}
              onClick={() => {
                close();
                b.onClick?.();
              }}
            >
              {b.label}
            </button>
          ))}
        </div>
      </Modal>
    ));

  const onTable = (t: TableDef) => {
    const checkId = tableChecks[t.id];
    if (moveMode) {
      const from = moveMode.from;
      if (!from) {
        if (!checkId) return dialogs.message(`Table ${t.label} has no open check to move.`, 'Move/Join');
        return setMoveMode({ from: t.id });
      }
      const fromLabel = tableLabel(from);
      if (t.id === from || tableChecks[from] === checkId) return setMoveMode({ from: null });
      setMoveMode(null);
      const done = (err: string | null) => err && dialogs.message(err, 'Move/Join');
      if (!checkId)
        return ask('Move Table', `Move Table ${fromLabel} to ${t.label}`, [
          { label: 'Move', tone: 'dark', onClick: () => done(actions.moveTable(from, t.id)) },
          { label: 'Cancel', tone: 'grey' },
        ]);
      return ask('Move/Combine Table', `Would you like to move/combine Table ${fromLabel} to ${t.label}?`, [
        { label: 'Move', tone: 'dark', onClick: () => done(actions.moveTable(from, t.id)) },
        { label: 'Join', tone: 'light', onClick: () => done(actions.joinTables(from, t.id)) },
        { label: 'Cancel', tone: 'grey' },
      ]);
    }
    if (printMode) {
      setPrintMode(false);
      if (!checkId) return dialogs.message(`Table ${t.label} has no open check to print.`, 'Print');
      if (!actions.print(checkId)) return;
      const check = checks[checkId];
      return dialogs.custom((close) => (
        <Modal w={400} title={`Print Check - ${t.label} (simulated)`}>
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
    }
    if (tenderMode) {
      setTenderMode(false);
      if (!checkId) return dialogs.message(`Table ${t.label} has no open check.`, 'Tender');
      return actions.openTender(checkId);
    }
    if (checkId) {
      const c = checks[checkId];
      // Someone else's check (e.g. after a Join): the POS asks before opening it.
      if (c && currentUser && c.server !== currentUser)
        return ask('Order', 'This is not your order. Do you want to proceed?', [
          {
            label: 'Change Server',
            tone: 'dark',
            onClick: () => {
              actions.changeServer(checkId);
              actions.openTable(t.id);
            },
          },
          { label: "Don't Change Server", tone: 'light', onClick: () => actions.openTable(t.id) },
          { label: 'Cancel', tone: 'grey' },
        ]);
      return actions.openTable(t.id);
    }
    dialogs.keypad({
      title: `Table ${t.label} - Guest Count`,
      subtitle: 'Enter the number of guests',
      onEnter: (v) => {
        const n = parseInt(v, 10);
        if (!n || n < 1) return dialogs.message('Please enter the number of guests.');
        actions.seatTable(t.id, n);
      },
    });
  };

  const rightBtn = (label: string, top: number, onClick: () => void, opts: { blue?: boolean; active?: boolean } = {}) => (
    <button
      data-testid={`floor-${label}`}
      className={`pos-btn ${opts.blue || opts.active ? 'pos-btn-blue' : ''}`}
      style={{ left: 886, top, width: 120, height: 52, fontSize: 13, fontWeight: opts.blue ? 'bold' : 'normal' }}
      onClick={onClick}
    >
      {label}
    </button>
  );

  return (
    <div className="pos-screen" style={{ background: '#eaf0f0' }}>
      <div className="pos-header">
        <div className="pos-abs" style={{ left: 16, top: 15 }}>
          <BluuLogo height={34} />
        </div>
        <div className="pos-abs" style={{ left: 140, top: 16 }}>
          <IconForkSpoon size={30} color="#3c6fb8" />
        </div>
        <div className="pos-abs" style={{ left: 174, top: 22, fontSize: 16, color: '#3c6fb8', fontWeight: 'bold' }}>
          Dine-in
        </div>
        <div className="pos-header-sep" style={{ left: 264 }} />
        <div className="pos-abs" style={{ left: 280, top: 16 }}>
          <IconPerson size={30} />
        </div>
        <div className="pos-abs" style={{ left: 330, top: 24, fontSize: 13, width: 92, textAlign: 'center', overflow: 'hidden' }}>
          {currentUser ?? settings.serverName}
        </div>
        <div className="pos-header-sep" style={{ left: 429 }} />
        <div
          role="button"
          data-testid="floor-printer"
          data-armed={printMode}
          className="pos-abs"
          style={{ left: 436, top: 18, cursor: 'pointer' }}
          title="Print check"
          onClick={() => {
            setTenderMode(false);
            setMoveMode(null);
            setPrintMode((m) => !m);
          }}
        >
          <IconPrinter size={28} />
          <div className="pos-abs" style={{ left: 18, top: -4 }}>
            {printMode ? <IconCheckBadge size={12} /> : <IconMinusBadge size={12} />}
          </div>
        </div>
        <div className="pos-abs" style={{ left: 478, top: 21, border: '2px solid #333', borderRadius: 4, padding: '1px 4px', fontSize: 12, fontWeight: 'bold', color: '#3c6fb8' }}>
          VIP
        </div>
        <div className="pos-abs" style={{ left: 530, top: 16 }}>
          <IconReceiptDollar size={30} />
        </div>
        <div className="pos-header-sep" style={{ left: 571 }} />
        <div className="pos-header-sep" style={{ left: 673 }} />
        <HeaderClock style={{ right: 14, top: 38 }} />
      </div>

      {sections.map((s, i) => (
        <button
          key={s.id}
          data-testid={`section-${s.id}`}
          className={`pos-btn ${s.id === section ? 'pos-btn-blue' : ''}`}
          style={{
            left: 32 + i * 163,
            top: 80,
            width: 155,
            height: 43,
            fontSize: 12,
            letterSpacing: 2,
            color: s.id === section ? '#16233a' : '#333',
            fontWeight: s.id === section ? 'normal' : 'normal',
          }}
          onClick={() => actions.setSection(s.id)}
        >
          {s.label}
        </button>
      ))}

      {sec.tables.map((t) => (
        <TableTile key={t.id} t={t} check={tableChecks[t.id] ? checks[tableChecks[t.id]] : undefined} taxRate={settings.taxRate} nowMs={nowMs} onClick={() => onTable(t)} />
      ))}
      {sec.missingReference && (
        <div className="pos-abs" style={{ left: 120, top: 330, width: 620, textAlign: 'center', fontSize: 15, color: '#555', lineHeight: 1.5 }}>
          The PATIO table layout was not included in the reference screenshots.
          <br />
          Send a photo of the PATIO tab to add these tables.
        </div>
      )}
      {printMode && (
        <div className="pos-abs" style={{ left: 32, top: 132, fontSize: 14, color: '#2a8a3a', fontWeight: 'bold' }}>
          Select a table to print its check.
        </div>
      )}
      {moveMode && (
        <div className="pos-abs" data-testid="move-hint" style={{ left: 32, top: 132, fontSize: 14, color: '#1c5bb8', fontWeight: 'bold' }}>
          {moveMode.from ? `Select the table to move ${tableLabel(moveMode.from)} to.` : 'Please select the table that needs to be moved.'}
        </div>
      )}
      {tenderMode && (
        <div className="pos-abs" style={{ left: 32, top: 132, fontSize: 14, color: '#1c5bb8', fontWeight: 'bold' }}>
          Select a table to tender.
        </div>
      )}

      {rightBtn('Information', 80, () => dialogs.notInSimulator('Information'), { blue: true })}
      {rightBtn(
        'Move/Join',
        148,
        () => {
          setPrintMode(false);
          setTenderMode(false);
          setMoveMode((m) => (m ? null : { from: null }));
        },
        { active: !!moveMode },
      )}
      {rightBtn('Link Table', 213, () => dialogs.notInSimulator('Link Table'))}
      {rightBtn('Tender', 278, () => {
        setPrintMode(false);
        setMoveMode(null);
        setTenderMode((m) => !m);
      }, { active: tenderMode })}
      {rightBtn('Quick Serve', 343, () => dialogs.notInSimulator('Quick Serve'))}
      {rightBtn('Cash Drawer', 408, () => dialogs.notInSimulator('Cash Drawer'))}
      {rightBtn('Refund', 473, () => dialogs.notInSimulator('Refund'))}
      <button data-testid="floor-Close" className="pos-btn pos-btn-blue" style={{ left: 886, top: 695, width: 120, height: 54, fontSize: 14 }} onClick={() => actions.goto('main')}>
        Close
      </button>
    </div>
  );
}
