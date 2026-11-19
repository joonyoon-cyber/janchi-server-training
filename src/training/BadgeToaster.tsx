import { useEffect, useRef, useState } from 'react';
import { BADGE, earnedKeys, TIER_NAMES, type Achievements } from './achievements';

/**
 * Celebrates badges the moment they are earned. Which ones were already announced is kept per
 * person in this browser; the first time, everything already earned is marked as seen quietly.
 */
export function BadgeToaster({ ach, loading, who, onOpen }: { ach: Achievements; loading: boolean; who: string; onOpen: () => void }) {
  const [toasts, setToasts] = useState<{ key: string; id: string; tier: number; extra: number }[]>([]);
  const timer = useRef<number>();

  useEffect(() => {
    if (loading) return;
    const storeKey = `janchi:badges-seen:${who}`;
    const earned = earnedKeys(ach);
    let seen: Set<string> | null = null;
    try {
      const raw = localStorage.getItem(storeKey);
      seen = raw ? new Set(JSON.parse(raw) as string[]) : null;
    } catch {
      seen = new Set(earned);
    }
    const fresh = seen ? earned.filter((k) => !seen!.has(k)) : [];
    try {
      localStorage.setItem(storeKey, JSON.stringify(earned));
    } catch {
      // ignore
    }
    if (!fresh.length) return;
    // Show the last few (highest tiers last), and say how many more there are.
    const show = fresh.slice(-3).map((k, i, arr) => {
      const [id, tier] = k.split(':');
      return { key: `${k}:${Date.now()}`, id, tier: Number(tier), extra: i === arr.length - 1 ? fresh.length - arr.length : 0 };
    });
    setToasts(show);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToasts([]), 7000);
  }, [ach, loading, who]);

  if (!toasts.length) return null;
  return (
    <div className="pointer-events-none fixed bottom-12 right-4 z-[60] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2" data-testid="badge-toasts">
      {toasts.map((t, i) => {
        const def = BADGE.get(t.id);
        if (!def) return null;
        return (
          <button
            key={t.key}
            className="badge-pop pointer-events-auto flex items-center gap-3 rounded-2xl bg-gradient-to-r from-slate-900 to-slate-800 p-3 text-left shadow-2xl shadow-black/50 ring-1 ring-amber-400/50"
            style={{ animationDelay: `${i * 0.15}s` }}
            onClick={() => {
              setToasts([]);
              onOpen();
            }}
          >
            <span className="badge-spin flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-100 via-amber-400 to-amber-700 p-[3px]">
              <span className="flex h-full w-full items-center justify-center rounded-full bg-slate-900 text-2xl">{def.icon}</span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[10px] font-bold uppercase tracking-[0.2em] text-amber-300">Badge earned!</span>
              <span className="block truncate font-bold text-white">
                {def.name}
                {def.tiers.length > 1 && <span className="ml-1.5 text-xs text-amber-200">{TIER_NAMES[t.tier - 1]}</span>}
              </span>
              <span className="block text-[11px] text-slate-400">{t.extra > 0 ? `+${t.extra} more · ` : ''}Tap to see your profile</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
