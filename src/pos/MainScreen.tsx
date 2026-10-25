import type { ReactNode } from 'react';
import { tableLabel } from '../lib/menu';
import { checkTotals, fmt } from '../lib/money';
import { actions, getState, usePos } from '../lib/store';
import { BluuLogo, DlgButton, HeaderClock, Modal, ModText, dialogs } from './common';
import {
  IconCashierIn,
  IconCashierOut,
  IconDrawer,
  IconForkSpoon,
  IconGear,
  IconGift,
  IconHeadset,
  IconHome,
  IconLogout,
  IconMegaphone,
  IconPerson,
  IconQuickServe,
  IconRecall,
  IconRefresh,
  IconSwap,
  IconTip,
  IconUnlock,
  IconCard,
} from './icons';

/** Lists open checks; used by Recall and Tender on the main screen. */
export function openCheckPicker(title: string, onPick: (checkId: string) => void) {
  dialogs.custom((close) => {
    const s = getState();
    const open = Object.values(s.checks).filter((c) => c.status === 'open');
    return (
      <Modal w={460} title={title}>
        <div style={{ padding: 12, maxHeight: 420, overflowY: 'auto' }}>
          {open.length === 0 && <div style={{ padding: 16, fontSize: 15 }}>There are no open checks.</div>}
          {open.map((c) => (
            <button
              key={c.id}
              className="pos-btn"
              style={{ position: 'relative', width: '100%', height: 46, marginBottom: 6, justifyContent: 'space-between', padding: '0 14px', fontSize: 15 }}
              onClick={() => {
                close();
                onPick(c.id);
              }}
            >
              <b>{tableLabel(c.tableId)}</b>
              <span>Check {c.number}</span>
              <span>{c.server}</span>
              <span style={{ color: '#d0303a', fontWeight: 'bold' }}>{fmt(checkTotals(c, s.settings.taxRate).balance)}</span>
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: 12 }}>
          <DlgButton onClick={close}>Close</DlgButton>
        </div>
      </Modal>
    );
  });
}

function Tile({ x, y, icon, label, onClick }: { x: number; y: number; icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <div
      role="button"
      data-testid={`main-${label}`}
      onClick={onClick}
      className="pos-abs"
      style={{ left: x - 75, top: y - 52, width: 150, height: 118, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}
    >
      {icon}
      <div style={{ fontSize: 13, color: '#222', letterSpacing: 0.2 }}>{label}</div>
    </div>
  );
}

export function MainScreen() {
  const settings = usePos((s) => s.settings);
  const side = (y: number, icon: ReactNode, label: string, selected: boolean, onClick: () => void) => (
    <div
      role="button"
      onClick={onClick}
      className="pos-abs"
      style={{
        left: 8,
        top: y,
        width: 178,
        height: 48,
        borderRadius: 6,
        background: selected ? 'rgba(20,50,130,0.35)' : 'transparent',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        paddingLeft: 12,
        color: '#e8eefc',
        fontSize: 16,
        cursor: 'pointer',
      }}
    >
      {icon}
      {label}
    </div>
  );
  const ic = 42;
  return (
    <div className="pos-screen" style={{ background: '#f2f5f2' }}>
      <div className="pos-header" style={{ height: 60 }}>
        <div className="pos-abs" style={{ left: 18, top: 12 }}>
          <BluuLogo height={34} />
        </div>
        <div className="pos-header-sep" style={{ left: 535, height: 58 }} />
        <div className="pos-header-sep" style={{ left: 669, height: 58 }} />
        <ModText style={{ right: 12, top: 10 }} />
        <HeaderClock style={{ right: 12, top: 36 }} />
      </div>
      <div className="pos-abs" style={{ left: 0, top: 62, width: 194, height: 706, background: 'linear-gradient(#3c7de0, #2b66cc)' }}>
        {side(22, <IconHome size={22} color="#dfe8ff" />, 'Main', true, () => undefined)}
        {side(92, <IconMegaphone size={22} color="#dfe8ff" />, 'Announcement', false, () => dialogs.notInSimulator('Announcement'))}
        {side(158, <IconGear size={22} color="#dfe8ff" />, 'Operations', false, () => dialogs.notInSimulator('Operations'))}
        <div className="pos-abs" style={{ left: 24, bottom: 12, color: '#dfe8ff', fontSize: 12 }}>
          Version 1.0 <span style={{ color: '#fff' }}>●</span>
        </div>
      </div>
      <div className="pos-abs" style={{ left: 212, top: 76 }}>
        <IconPerson size={22} />
      </div>
      <div className="pos-abs" style={{ left: 330, top: 80, fontSize: 13 }}>
        POS 13[14] &nbsp; <span style={{ color: '#555' }}>{settings.serverName}</span>
      </div>
      {[
        [750, <IconHeadset size={24} />, 'Support'],
        [808, <IconRefresh size={24} />, 'Refresh'],
        [866, <IconUnlock size={24} />, 'Unlock'],
        [925, <IconSwap size={24} />, 'Switch User'],
        [983, <IconLogout size={24} />, 'Log Out'],
      ].map(([x, icon, name]) => (
        <div
          key={name as string}
          role="button"
          title={name as string}
          className="pos-abs"
          style={{ left: (x as number) - 14, top: 75, cursor: 'pointer', padding: 2 }}
          onClick={() => dialogs.notInSimulator(name as string)}
        >
          {icon as ReactNode}
        </div>
      ))}
      <div className="pos-abs" style={{ left: 223, top: 146, fontSize: 22, fontWeight: 'bold', fontStyle: 'italic', color: '#222' }}>
        JANCHI KOREAN BBQ&nbsp;&nbsp;BAR
      </div>
      <Tile x={454} y={260} icon={<IconForkSpoon size={ic} />} label="Dine-in" onClick={() => actions.goto('floor')} />
      <Tile x={765} y={260} icon={<IconQuickServe size={ic} />} label="Quick Serve" onClick={() => dialogs.notInSimulator('Quick Serve')} />
      <Tile x={454} y={386} icon={<IconRecall size={ic} />} label="Recall" onClick={() => openCheckPicker('Recall', (id) => actions.openTable(getState().checks[id].tableId))} />
      <Tile x={765} y={386} icon={<IconCard size={ic} />} label="Tender" onClick={() => openCheckPicker('Tender', (id) => actions.openTender(id))} />
      <Tile x={454} y={512} icon={<IconCashierIn size={ic} />} label="Cashier In" onClick={() => dialogs.notInSimulator('Cashier In')} />
      <Tile x={610} y={512} icon={<IconCashierOut size={ic} />} label="Cashier Out" onClick={() => dialogs.notInSimulator('Cashier Out')} />
      <Tile x={765} y={512} icon={<IconTip size={ic} />} label="Tip Adjustments" onClick={() => dialogs.notInSimulator('Tip Adjustments')} />
      <Tile x={454} y={638} icon={<IconGift size={ic} />} label="Gift Card" onClick={() => dialogs.notInSimulator('Gift Card')} />
      <Tile x={610} y={638} icon={<IconDrawer size={ic} />} label="Cash Drawer" onClick={() => dialogs.notInSimulator('Cash Drawer')} />
    </div>
  );
}
