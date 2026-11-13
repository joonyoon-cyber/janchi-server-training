import { useEffect, useState } from "react";
import {
  clearLeaderboard,
  loadLeaderboard,
  loadMyRuns,
  openSignIn,
  type LeaderRow,
  type RunRow,
  type useAuth,
} from "../lib/supabase";
import { fmtTime } from "./TestMode";

type Auth = ReturnType<typeof useAuth>;

const initial = (name: string) => (name.trim()[0] ?? "?").toUpperCase();

/** Gold, silver and bronze. */
const MEDAL = [
  {
    ring: "ring-amber-300",
    grad: "from-amber-200 via-amber-400 to-amber-600",
    text: "text-amber-300",
    glow: "shadow-[0_0_40px_rgba(251,191,36,0.45)]",
    h: "h-36 sm:h-40",
    label: "1st",
  },
  {
    ring: "ring-slate-200",
    grad: "from-slate-50 via-slate-300 to-slate-500",
    text: "text-slate-200",
    glow: "shadow-[0_0_28px_rgba(226,220,210,0.25)]",
    h: "h-24 sm:h-28",
    label: "2nd",
  },
  {
    ring: "ring-orange-400",
    grad: "from-orange-200 via-orange-400 to-orange-700",
    text: "text-orange-300",
    glow: "shadow-[0_0_28px_rgba(251,146,60,0.3)]",
    h: "h-16 sm:h-20",
    label: "3rd",
  },
];

function Crown() {
  return (
    <svg
      width="34"
      height="26"
      viewBox="0 0 34 26"
      className="drop-shadow-[0_0_8px_rgba(251,191,36,0.8)]"
      aria-hidden
    >
      <path
        d="M2 8l7 6 8-12 8 12 7-6-3 16H5z"
        fill="url(#crown)"
        stroke="#78350f"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <defs>
        <linearGradient id="crown" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fde68a" />
          <stop offset="1" stopColor="#d97706" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function Avatar({
  name,
  size = "h-10 w-10 text-base",
  className = "",
}: {
  name: string;
  size?: string;
  className?: string;
}) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-sky-800 font-bold text-white ${size} ${className}`}
    >
      {initial(name)}
    </span>
  );
}

function PodiumSpot({
  row,
  place,
  me,
}: {
  row: LeaderRow;
  place: 0 | 1 | 2;
  me: boolean;
}) {
  const m = MEDAL[place];
  return (
    <div
      className="lb-rise flex w-1/3 max-w-[13rem] flex-col items-center"
      style={{ animationDelay: `${[0.35, 0.15, 0.5][place]}s` }}
    >
      <div className="mb-1 h-7">{place === 0 && <Crown />}</div>
      <div className={`relative rounded-full ring-4 ${m.ring} ${m.glow}`}>
        <Avatar
          name={row.display_name}
          size={place === 0 ? "h-20 w-20 text-3xl" : "h-14 w-14 text-xl"}
        />
        <span
          className={`absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-b px-2 text-[11px] font-black text-slate-950 ${m.grad}`}
        >
          {place + 1}
        </span>
      </div>
      <div className="mt-3 max-w-full truncate px-1 text-center text-sm font-semibold text-white">
        {row.display_name}
        {me && (
          <span className="ml-1 rounded-full bg-sky-600 px-1.5 py-0.5 align-middle text-[9px] font-bold uppercase">
            You
          </span>
        )}
      </div>
      <div className={`text-2xl font-black tabular-nums ${m.text}`}>
        {row.score}
      </div>
      <div className="text-[11px] tabular-nums text-slate-400">
        ⏱ {fmtTime(row.clear_time_sec)}
      </div>
      <div
        className={`lb-shine relative mt-2 w-full overflow-hidden rounded-t-xl bg-gradient-to-b ${m.grad} ${m.h} opacity-90`}
      >
        <div className="absolute inset-x-0 top-2 text-center text-lg font-black text-slate-950/70">
          {m.label}
        </div>
      </div>
    </div>
  );
}

function Hero({ children }: { children?: React.ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-sky-700 via-sky-900 to-slate-950 px-5 pb-6 pt-7 ring-1 ring-sky-800/60 sm:px-8">
      <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-amber-400/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-10 h-64 w-64 rounded-full bg-sky-500/30 blur-3xl" />
      <div className="lb-sparkles pointer-events-none absolute inset-0" />
      <div className="relative">
        <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-amber-200/90">
          Janchi server training
        </div>
        <h2 className="mt-1 text-3xl font-black tracking-tight text-white sm:text-4xl">
          Leaderboard <span className="inline-block animate-bounce">🏆</span>
        </h2>
        <p className="mt-1 text-sm text-sky-100/80">
          Best Test per person · highest score wins, the faster clear time
          breaks ties.
        </p>
        {children}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl bg-slate-900/80 p-4 ring-1 ring-slate-800">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </div>
      <div className="mt-1 text-2xl font-black tabular-nums text-white">
        {value}
      </div>
      {sub && <div className="text-xs text-slate-400">{sub}</div>}
    </div>
  );
}

export function Leaderboard({ auth }: { auth: Auth }) {
  const [rows, setRows] = useState<LeaderRow[] | null>(null);
  const [mine, setMine] = useState<RunRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [editing, setEditing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // The leaderboard is public; your own runs need sign-in.
  useEffect(() => {
    loadLeaderboard().then((r) => {
      setRows(r.rows);
      setError(r.error);
    });
    if (auth.session) loadMyRuns(auth.session.user.id).then(setMine);
    else setMine([]);
  }, [auth.session]);

  if (!auth.ready) return <div className="p-6 text-slate-400">Loading…</div>;
  const me = auth.session?.user.id ?? null;
  const myRank = rows ? rows.findIndex((r) => r.user_id === me) + 1 : 0;
  const myBest = rows?.find((r) => r.user_id === me);
  const top = rows?.slice(0, 3) ?? [];
  const rest = rows?.slice(3) ?? [];
  const myName = auth.profile?.display_name ?? "…";

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 text-slate-100 sm:p-6">
      <Hero>
        {!auth.session ? (
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-sky-100">
            <span>Want your name up here? Sign in and take the Test.</span>
            <button
              data-testid="lb-sign-in"
              className="rounded-full bg-white px-4 py-1.5 font-semibold text-sky-800 shadow-lg hover:bg-amber-100"
              onClick={() => openSignIn()}
            >
              Sign in
            </button>
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-sky-100">
            <Avatar name={myName} size="h-7 w-7 text-xs" />
            {editing ? (
              <form
                className="flex gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const n = name.trim().slice(0, 40);
                  if (!n) return;
                  const err = await auth.rename(n);
                  setMsg(err);
                  if (!err) {
                    setEditing(false);
                    setRows(
                      (rs) =>
                        rs?.map((r) =>
                          r.user_id === me ? { ...r, display_name: n } : r,
                        ) ?? rs,
                    );
                  }
                }}
              >
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-44 rounded-full bg-white px-3 py-1 text-slate-900"
                />
                <button className="rounded-full bg-white/15 px-3 py-1 font-semibold hover:bg-white/25">
                  Save
                </button>
              </form>
            ) : (
              <span>
                You appear as <b className="text-white">{myName}</b>{" "}
                <button
                  className="text-amber-200 underline"
                  onClick={() => {
                    setName(auth.profile?.display_name ?? "");
                    setEditing(true);
                  }}
                >
                  change
                </button>
              </span>
            )}
            {msg && <span className="text-rose-200">{msg}</span>}
          </div>
        )}

        {rows && top.length > 0 && (
          <div
            data-testid="podium"
            className="mt-6 flex items-end justify-center gap-2 sm:gap-4"
          >
            {top[1] && (
              <PodiumSpot row={top[1]} place={1} me={top[1].user_id === me} />
            )}
            <PodiumSpot row={top[0]} place={0} me={top[0].user_id === me} />
            {top[2] && (
              <PodiumSpot row={top[2]} place={2} me={top[2].user_id === me} />
            )}
          </div>
        )}
      </Hero>

      {error && (
        <div className="rounded-xl bg-rose-950/50 p-3 text-sm text-rose-200">
          {!auth.session && /permission denied/i.test(error)
            ? 'The leaderboard is not open to visitors yet. Sign in to see it.'
            : `Could not load the leaderboard: ${error}`}
        </div>
      )}
      {rows === null ? (
        <div className="text-slate-400">Loading…</div>
      ) : rows.length === 0 && error ? null : rows.length === 0 ? (
        <div className="rounded-2xl bg-slate-900/80 p-6 text-center text-slate-300 ring-1 ring-slate-800">
          <div className="text-3xl">🥇</div>
          No Test results yet. Take the first Test and claim the top spot!
        </div>
      ) : (
        <>
          {auth.session && (
            <div className="grid grid-cols-3 gap-3">
              <Stat
                label="Your rank"
                value={myRank ? `#${myRank}` : "-"}
                sub={myRank ? `of ${rows.length}` : "Take a Test to get ranked"}
              />
              <Stat
                label="Best score"
                value={myBest ? String(myBest.score) : "-"}
                sub="out of 100"
              />
              <Stat
                label="Best time"
                value={myBest ? fmtTime(myBest.clear_time_sec) : "-"}
                sub={
                  myBest
                    ? `${myBest.attempts} Test${myBest.attempts === 1 ? "" : "s"} taken`
                    : undefined
                }
              />
            </div>
          )}

          {rest.length > 0 && (
            <ol data-testid="leaderboard" className="space-y-2">
              {rest.map((r, i) => {
                const isMe = r.user_id === me;
                return (
                  <li
                    key={r.user_id}
                    className={`lb-rise flex items-center gap-3 rounded-2xl px-3 py-2.5 ring-1 ${isMe ? "bg-sky-900/50 ring-2 ring-sky-500" : "bg-slate-900/80 ring-slate-800"}`}
                    style={{
                      animationDelay: `${0.6 + Math.min(i, 12) * 0.05}s`,
                    }}
                  >
                    <span className="w-7 text-center text-sm font-bold tabular-nums text-slate-400">
                      {i + 4}
                    </span>
                    <Avatar name={r.display_name} size="h-9 w-9 text-sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 truncate text-sm font-semibold">
                        <span className="truncate">{r.display_name}</span>
                        {isMe && (
                          <span className="rounded-full bg-sky-600 px-1.5 py-0.5 text-[9px] font-bold uppercase">
                            You
                          </span>
                        )}
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-800">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-sky-700 to-amber-400"
                          style={{ width: `${Math.max(2, r.score)}%` }}
                        />
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-black tabular-nums">
                        {r.score}
                      </div>
                      <div className="text-[11px] tabular-nums text-slate-400">
                        ⏱ {fmtTime(r.clear_time_sec)}
                      </div>
                    </div>
                    <div className="hidden w-20 text-right text-[11px] text-slate-500 sm:block">
                      {new Date(r.created_at).toLocaleDateString()}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </>
      )}

      {auth.profile?.is_owner && <OwnerTools onCleared={() => setRows([])} />}

      {auth.session && (
        <div className="rounded-2xl bg-slate-900/80 p-4 ring-1 ring-slate-800">
          <div className="mb-3 font-semibold">Your recent Tests</div>
          {mine.length === 0 ? (
            <div className="text-sm text-slate-400">
              None yet. Take a Test from the Test tab.
            </div>
          ) : (
            <div className="space-y-1.5">
              {mine.map((r) => (
                <div key={r.id} className="flex items-center gap-3 text-sm">
                  <span className="w-40 shrink-0 text-xs text-slate-400">
                    {new Date(r.created_at).toLocaleString([], {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-sky-700 to-sky-400"
                      style={{ width: `${Math.max(2, r.score)}%` }}
                    />
                  </div>
                  <span className="w-12 text-right text-xs tabular-nums text-slate-400">
                    {fmtTime(r.clear_time_sec)}
                  </span>
                  <span className="w-8 text-right font-bold tabular-nums">
                    {r.score}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {!auth.session && (
        <p className="text-center text-xs text-slate-500">
          By signing in you agree to the{" "}
          <a
            className="underline"
            href="terms.html"
            target="_blank"
            rel="noreferrer"
          >
            Terms of Service
          </a>{" "}
          and{" "}
          <a
            className="underline"
            href="privacy.html"
            target="_blank"
            rel="noreferrer"
          >
            Privacy Policy
          </a>
          .
        </p>
      )}
    </div>
  );
}

/** Owner only: clear every saved Test run. The database checks the owner flag too. */
function OwnerTools({ onCleared }: { onCleared: () => void }) {
  const [confirmText, setConfirmText] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div
      data-testid="owner-tools"
      className="space-y-2 rounded-2xl border border-rose-800/60 bg-rose-950/30 p-4"
    >
      <div className="font-semibold text-rose-200">Owner tools</div>
      <p className="text-sm text-slate-300">
        Clear the leaderboard: deletes every saved Test run for everyone. Names
        and accounts are kept. This cannot be undone.
      </p>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (confirmText !== "CLEAR") return;
          setBusy(true);
          const err = await clearLeaderboard();
          setBusy(false);
          setConfirmText("");
          setMsg(err ? `Could not clear: ${err}` : "Leaderboard cleared.");
          if (!err) onCleared();
        }}
      >
        <input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder="Type CLEAR"
          className="w-36 rounded bg-white px-2 py-1 text-sm text-slate-900"
        />
        <button
          disabled={confirmText !== "CLEAR" || busy}
          className="rounded bg-rose-700 px-3 py-1 text-sm font-semibold hover:bg-rose-600 disabled:opacity-50"
        >
          {busy ? "Clearing…" : "Clear leaderboard"}
        </button>
      </form>
      {msg && <div className="text-sm text-slate-200">{msg}</div>}
    </div>
  );
}
