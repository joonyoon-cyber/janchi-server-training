import { useState } from 'react';
import { actions, getState } from '../lib/store';
import { dialogs } from './common';

/**
 * BLUU "Log-in" keypad. Every main-screen button asks for the employee ID
 * first; the logged-in employee becomes the server on checks opened next.
 */
function LoginPad({ close, then }: { close: () => void; then: () => void }) {
  const [id, setId] = useState('');
  const press = (k: string) => setId((v) => (v + k).slice(0, 8));
  const submit = () => {
    const { settings } = getState();
    close();
    if (id !== settings.loginId) return dialogs.message('Invalid Log-in ID.', 'Log-in');
    actions.login(settings.serverName);
    then();
  };
  const key = (label: string, col: number, row: number, onClick: () => void) => (
    <button
      key={label}
      data-testid={`login-key-${label}`}
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
      <div data-testid="login-pad" className="pos-modal" style={{ left: 296, top: 92, width: 328, height: 426, background: '#f3f5f2', borderRadius: 2, border: '1px solid #b9c2c4' }}>
        <div className="pos-abs" style={{ left: 0, top: 0, width: 326, height: 53, background: '#cbdde2', color: '#2a5cab', fontWeight: 'bold', fontSize: 17, padding: '16px 18px' }}>
          Log-in
        </div>
        <div className="pos-abs" data-testid="login-display" style={{ left: 8, top: 56, width: 228, height: 44, fontSize: 24, letterSpacing: 6, padding: '8px 10px', color: '#222' }}>
          {'●'.repeat(id.length)}
        </div>
        <div className="pos-abs" style={{ left: 237, top: 58, width: 1, height: 40, background: '#333' }} />
        <button
          className="pos-abs"
          aria-label="Backspace"
          style={{ left: 254, top: 64, width: 46, height: 28, border: 'none', background: 'transparent', cursor: 'pointer' }}
          onClick={() => setId((v) => v.slice(0, -1))}
        >
          <svg width="40" height="26" viewBox="0 0 40 26">
            <path d="M12 2h24a3 3 0 0 1 3 3v16a3 3 0 0 1-3 3H12L2 13z" fill="#c6cdd6" />
            <path d="M19 8l10 10M29 8 19 18" stroke="#fff" strokeWidth="3" />
          </svg>
        </button>
        <div className="pos-abs" style={{ left: 8, top: 101, width: 312, height: 2, background: '#222' }} />
        {['7', '8', '9', '4', '5', '6', '1', '2', '3'].map((k, i) => key(k, i % 3, Math.floor(i / 3), () => press(k)))}
        {key('0', 0, 3, () => press('0'))}
        {key('Clear', 1, 3, () => setId(''))}
        {key('00', 2, 3, () => press('00'))}
        <button data-testid="login-close" className="pos-btn pos-btn-blue" style={{ left: 245, top: 106, width: 75, height: 154, fontSize: 15, background: 'linear-gradient(#5f8fea, #4677e0)' }} onClick={close}>
          Close
        </button>
        <button data-testid="login-ok" className="pos-btn pos-btn-navy" style={{ left: 245, top: 264, width: 75, height: 154, fontSize: 15 }} onClick={submit}>
          Ok
        </button>
      </div>
    </>
  );
}

export function requireLogin(then: () => void) {
  dialogs.custom((close) => <LoginPad close={close} then={then} />);
}
