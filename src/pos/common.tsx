import { useEffect, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { now } from '../lib/store';

export function BluuLogo({ height = 34 }: { height?: number }) {
  const w = height * 3.3;
  return (
    <svg width={w} height={height} viewBox="0 0 132 40" aria-label="bluu">
      <defs>
        <linearGradient id="bluuG" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5aa2e6" />
          <stop offset="1" stopColor="#1d4f9c" />
        </linearGradient>
      </defs>
      <circle cx="18" cy="20" r="16" fill="url(#bluuG)" />
      <path d="M7 27c5-12 13-17 22-15-8 1-13 7-16 17z" fill="#fff" opacity="0.92" />
      <path d="M13 31c4-9 10-13 17-12-6 1-10 6-12 13z" fill="#fff" opacity="0.7" />
      <text x="40" y="31" fontFamily="Arial, Helvetica, sans-serif" fontSize="31" fill="#1d4f9c" letterSpacing="-0.5">
        bluu
      </text>
      <text x="101" y="14" fontFamily="Arial" fontSize="7" fill="#1d4f9c">
        ®
      </text>
    </svg>
  );
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

/** "10/24/2026 PM 07:35" as shown in the BLUU header. */
export function formatHeaderDate(ms: number) {
  const d = new Date(ms);
  const h = d.getHours();
  const ap = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()} ${ap} ${pad(h12)}:${pad(d.getMinutes())}`;
}

/** "10/24/2026 7:35 PM" as shown on the tender screen. */
export function formatLongTime(ms: number) {
  const d = new Date(ms);
  const h = d.getHours();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()} ${h12}:${pad(d.getMinutes())} ${h >= 12 ? 'PM' : 'AM'}`;
}

export function formatClock(ms: number) {
  const d = new Date(ms);
  const h = d.getHours();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad(d.getMinutes())} ${h >= 12 ? 'PM' : 'AM'}`;
}

export function useNow(intervalMs = 1000) {
  const [t, setT] = useState(now());
  useEffect(() => {
    const id = setInterval(() => setT(now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return t;
}

export function HeaderClock({ style }: { style?: CSSProperties }) {
  const t = useNow();
  return (
    <div className="pos-abs" style={{ fontSize: 12.5, color: '#222', ...style }}>
      {formatHeaderDate(t)}
    </div>
  );
}

export function ModText({ style }: { style?: CSSProperties }) {
  return (
    <div className="pos-abs" style={{ fontSize: 11.5, color: '#222', whiteSpace: 'nowrap', ...style }}>
      Mod : bluu Restaurant Pro&nbsp; Ver. 3.0 : CC 10-037A1
    </div>
  );
}

// ---- Dialogs -----------------------------------------------------------------

type Dialog =
  | { kind: 'message'; title?: string; text: ReactNode; onOk?: () => void }
  | { kind: 'confirm'; title?: string; text: ReactNode; onYes: () => void; onNo?: () => void }
  | {
      kind: 'keypad';
      title: string;
      subtitle?: ReactNode;
      initial?: string;
      decimal?: boolean;
      quick?: { label: string; value: string }[];
      onEnter: (value: string) => void;
    }
  | { kind: 'custom'; render: (close: () => void) => ReactNode };

let dialog: Dialog | null = null;
const dialogListeners = new Set<() => void>();
function setDialog(d: Dialog | null) {
  dialog = d;
  dialogListeners.forEach((l) => l());
}

export const dialogs = {
  message(text: ReactNode, title?: string, onOk?: () => void) {
    setDialog({ kind: 'message', text, title, onOk });
  },
  confirm(text: ReactNode, onYes: () => void, title?: string, onNo?: () => void) {
    setDialog({ kind: 'confirm', text, onYes, title, onNo });
  },
  keypad(opts: Omit<Extract<Dialog, { kind: 'keypad' }>, 'kind'>) {
    setDialog({ kind: 'keypad', ...opts });
  },
  custom(render: (close: () => void) => ReactNode) {
    setDialog({ kind: 'custom', render });
  },
  close() {
    setDialog(null);
  },
  /** Used for buttons whose real behavior is outside the simulator's scope. */
  notInSimulator(name: string) {
    setDialog({
      kind: 'message',
      title: name,
      text: (
        <>
          <b>{name}</b> is not part of the training simulator yet.
          <br />
          Its behavior on the real BLUU POS has not been documented, so it is disabled here rather than guessed.
        </>
      ),
    });
  },
};

function Modal({ w, h, title, children }: { w: number; h?: number; title?: ReactNode; children: ReactNode }) {
  return (
    <>
      <div className="pos-modal-backdrop" />
      <div className="pos-modal" style={{ width: w, height: h, left: (1024 - w) / 2, top: h ? (768 - h) / 2 : 160 }}>
        {title && <div className="pos-modal-title">{title}</div>}
        {children}
      </div>
    </>
  );
}

function DlgButton({ children, onClick, blue, style }: { children: ReactNode; onClick: () => void; blue?: boolean; style?: CSSProperties }) {
  return (
    <button className={`pos-btn ${blue ? 'pos-btn-blue' : ''}`} style={{ position: 'relative', height: 44, minWidth: 110, fontSize: 14, ...style }} onClick={onClick}>
      {children}
    </button>
  );
}

function KeypadDialog({ d }: { d: Extract<Dialog, { kind: 'keypad' }> }) {
  const [v, setV] = useState(d.initial ?? '');
  const press = (k: string) => {
    if (k === 'C') return setV('');
    if (k === '←') return setV((x) => x.slice(0, -1));
    if (k === '.' && (!d.decimal || v.includes('.'))) return;
    if (v.includes('.') && v.split('.')[1].length >= 2) return;
    setV((x) => (x === '0' && k !== '.' ? k : x + k).slice(0, 9));
  };
  const keys = ['7', '8', '9', '4', '5', '6', '1', '2', '3', d.decimal ? '.' : 'C', '0', '←'];
  return (
    <Modal w={340} title={d.title}>
      <div style={{ padding: 12 }}>
        {d.subtitle && <div style={{ fontSize: 13, marginBottom: 6, color: '#333' }}>{d.subtitle}</div>}
        <div
          data-testid="keypad-display"
          style={{ background: '#fff', border: '1px solid #9aa3b2', height: 40, fontSize: 24, textAlign: 'right', padding: '4px 10px', marginBottom: 8, fontWeight: 'bold' }}
        >
          {v || '0'}
        </div>
        {d.quick && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
            {d.quick.map((q) => (
              <button key={q.label} className="pos-btn" style={{ position: 'relative', height: 32, flex: '1 0 22%', fontSize: 12 }} onClick={() => setV(q.value)}>
                {q.label}
              </button>
            ))}
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
          {keys.map((k) => (
            <button key={k} className="pos-btn" style={{ position: 'relative', height: 48, fontSize: 20, fontWeight: 'bold' }} onClick={() => press(k)}>
              {k}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <DlgButton style={{ flex: 1 }} onClick={() => setDialog(null)}>
            Cancel
          </DlgButton>
          <DlgButton
            blue
            style={{ flex: 1 }}
            onClick={() => {
              setDialog(null);
              d.onEnter(v || '0');
            }}
          >
            Enter
          </DlgButton>
        </div>
      </div>
    </Modal>
  );
}

export function DialogHost() {
  const d = useSyncExternalStore(
    (l) => {
      dialogListeners.add(l);
      return () => dialogListeners.delete(l);
    },
    () => dialog,
  );
  if (!d) return null;
  if (d.kind === 'keypad') return <KeypadDialog key={d.title + (d.initial ?? '')} d={d} />;
  if (d.kind === 'custom') return <>{d.render(() => setDialog(null))}</>;
  return (
    <Modal w={420} title={d.title ?? 'bluu'}>
      <div style={{ padding: '18px 18px 8px', fontSize: 15, lineHeight: 1.4, color: '#222' }}>{d.text}</div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: 14 }}>
        {d.kind === 'confirm' ? (
          <>
            <DlgButton
              onClick={() => {
                setDialog(null);
                d.onNo?.();
              }}
            >
              No
            </DlgButton>
            <DlgButton
              blue
              onClick={() => {
                setDialog(null);
                d.onYes();
              }}
            >
              Yes
            </DlgButton>
          </>
        ) : (
          <DlgButton
            blue
            onClick={() => {
              setDialog(null);
              d.onOk?.();
            }}
          >
            OK
          </DlgButton>
        )}
      </div>
    </Modal>
  );
}

export { Modal, DlgButton };
