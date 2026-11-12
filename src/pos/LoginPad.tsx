import { useState } from 'react';
import { actions, getState } from '../lib/store';
import { dialogs } from './common';

/**
 * The BLUU number pad dialog: title bar, entry line with backspace, keys
 * 7-9 / 4-6 / 1-3 / 0 Clear 00, and tall Close / Ok buttons.
 */
function BluuPad({ title, masked, money, prefix, close, onOk }: { title: string; masked?: boolean; money?: boolean; prefix: string; close: () => void; onOk: (value: string) => void }) {
  const [v, setV] = useState('');
  const press = (k: string) => setV((x) => (x + k).replace(/^0+(?=\d)/, '').slice(0, 8));
  // Money pads enter cents: 5, 00 -> 5.00 (Open Price on the gift certificate video).
  const shown = money ? (v ? (parseInt(v, 10) / 100).toFixed(2) : '') : v;
  const key = (label: string, col: number, row: number, onClick: () => void) => (
    <button
      key={label}
      data-testid={`${prefix}-key-${label}`}
      className="pos-btn"
      style={{ left: 8 + col * 79, top: 106 + row * 79, width: 75, height: 75, fontSize: label.length > 2 ? 15 : 16, background: 'linear-gradient(#f4f5f2, #e9ebe7)' }}
      onClick={onClick}
    >
      {label}
    </button>
  );
  return (
    <>
      <div className="pos-modal-backdrop" style={{ background: 'rgba(20,30,50,0.15)' }} />
      <div data-testid={`${prefix}-pad`} className="pos-modal" style={{ left: masked ? 296 : 340, top: masked ? 92 : 112, width: 328, height: 426, background: '#f3f5f2', borderRadius: 2, border: '1px solid #b9c2c4' }}>
        <div className="pos-abs" style={{ left: 0, top: 0, width: 326, height: 53, background: '#cbdde2', color: '#2a5cab', fontWeight: 'bold', fontSize: title.length > 20 ? 14 : 17, padding: '0 18px', display: 'flex', alignItems: 'center' }}>
          {title}
        </div>
        <div className="pos-abs" data-testid={`${prefix}-display`} style={{ left: 8, top: 56, width: 228, height: 44, fontSize: masked ? 24 : 30, letterSpacing: masked ? 6 : 0, padding: masked ? '8px 10px' : '2px 10px', textAlign: masked ? 'left' : 'right', fontWeight: masked ? 'normal' : 'bold', color: '#222' }}>
          {masked ? '●'.repeat(v.length) : shown}
        </div>
        <div className="pos-abs" style={{ left: 237, top: 58, width: 1, height: 40, background: '#333' }} />
        <button className="pos-abs" aria-label="Backspace" style={{ left: 254, top: 64, width: 46, height: 28, border: 'none', background: 'transparent', cursor: 'pointer' }} onClick={() => setV((x) => x.slice(0, -1))}>
          <svg width="40" height="26" viewBox="0 0 40 26">
            <path d="M12 2h24a3 3 0 0 1 3 3v16a3 3 0 0 1-3 3H12L2 13z" fill="#c6cdd6" />
            <path d="M19 8l10 10M29 8 19 18" stroke="#fff" strokeWidth="3" />
          </svg>
        </button>
        <div className="pos-abs" style={{ left: 8, top: 101, width: 312, height: 2, background: '#222' }} />
        {['7', '8', '9', '4', '5', '6', '1', '2', '3'].map((k, i) => key(k, i % 3, Math.floor(i / 3), () => press(k)))}
        {key('0', 0, 3, () => press('0'))}
        {key('Clear', 1, 3, () => setV(''))}
        {key('00', 2, 3, () => press('00'))}
        <button data-testid={`${prefix}-close`} className="pos-btn pos-btn-blue" style={{ left: 245, top: 106, width: 75, height: 154, fontSize: 15, background: 'linear-gradient(#5f8fea, #4677e0)' }} onClick={close}>
          Close
        </button>
        <button
          data-testid={`${prefix}-ok`}
          className="pos-btn pos-btn-navy"
          style={{ left: 245, top: 264, width: 75, height: 154, fontSize: 15 }}
          onClick={() => {
            close();
            onOk(money ? (parseInt(v || '0', 10) / 100).toFixed(2) : v);
          }}
        >
          Ok
        </button>
      </div>
    </>
  );
}

export function bluuPad(title: string, prefix: string, onOk: (value: string) => void, masked = false, money = false) {
  dialogs.custom((close) => <BluuPad title={title} prefix={prefix} masked={masked} money={money} close={close} onOk={onOk} />);
}

/**
 * BLUU "Log-in" keypad. Every main-screen button asks for the employee ID
 * first; the logged-in employee becomes the server on checks opened next.
 */
export function requireLogin(then: () => void) {
  bluuPad(
    'Log-in',
    'login',
    (id) => {
      const { settings } = getState();
      if (id !== settings.loginId) return dialogs.message('Invalid Log-in ID.', 'Log-in');
      actions.login(settings.serverName);
      then();
    },
    true,
  );
}
