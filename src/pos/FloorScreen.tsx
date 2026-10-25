import { useState } from 'react';
import { sections } from '../lib/menu';
import { checkTotals, fmt } from '../lib/money';
import { actions, usePos } from '../lib/store';
import type { Check, TableDef } from '../lib/types';
import { BluuLogo, HeaderClock, dialogs, formatClock, useNow } from './common';
import { IconForkSpoon, IconMinusBadge, IconPerson, IconPrinter, IconReceiptDollar } from './icons';

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
      {check && (
        <>
          <div className="pos-abs" style={{ left: 4, top: 30, fontSize: 12, color: '#3e9b3e' }}>
            {formatClock(check.openedAt)}
          </div>
          <div className="pos-abs" style={{ right: 4, top: 30, fontSize: 12, color: '#a040b8' }}>
            {elapsed(nowMs - check.openedAt)}
          </div>
          <div className="pos-abs" style={{ right: 4, top: 44, fontSize: 13, color: '#333', maxWidth: t.w - 8, overflow: 'hidden', whiteSpace: 'nowrap' }}>
            {check.server}
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
  const nowMs = useNow(15000);
  const [tenderMode, setTenderMode] = useState(false);
  const sec = sections.find((s) => s.id === section) ?? sections[0];

  const onTable = (t: TableDef) => {
    const checkId = tableChecks[t.id];
    if (tenderMode) {
      setTenderMode(false);
      if (!checkId) return dialogs.message(`Table ${t.label} has no open check.`, 'Tender');
      return actions.openTender(checkId);
    }
    if (checkId) return actions.openTable(t.id);
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
          {settings.serverName}
        </div>
        <div className="pos-header-sep" style={{ left: 429 }} />
        <div className="pos-abs" style={{ left: 436, top: 18 }} title="Printer">
          <IconPrinter size={28} />
          <div className="pos-abs" style={{ left: 18, top: -4 }}>
            <IconMinusBadge size={12} />
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
      {tenderMode && (
        <div className="pos-abs" style={{ left: 32, top: 132, fontSize: 14, color: '#1c5bb8', fontWeight: 'bold' }}>
          Select a table to tender.
        </div>
      )}

      {rightBtn('Information', 80, () => dialogs.notInSimulator('Information'), { blue: true })}
      {rightBtn('Move/Join', 148, () => dialogs.notInSimulator('Move/Join'))}
      {rightBtn('Link Table', 213, () => dialogs.notInSimulator('Link Table'))}
      {rightBtn('Tender', 278, () => setTenderMode((m) => !m), { active: tenderMode })}
      {rightBtn('Quick Serve', 343, () => dialogs.notInSimulator('Quick Serve'))}
      {rightBtn('Cash Drawer', 408, () => dialogs.notInSimulator('Cash Drawer'))}
      {rightBtn('Refund', 473, () => dialogs.notInSimulator('Refund'))}
      <button data-testid="floor-Close" className="pos-btn pos-btn-blue" style={{ left: 886, top: 695, width: 120, height: 54, fontSize: 14 }} onClick={() => actions.goto('main')}>
        Close
      </button>
    </div>
  );
}
