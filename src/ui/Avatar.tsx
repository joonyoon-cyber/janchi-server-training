/**
 * A person's picture: an uploaded photo, a picked emoji on a color, or their initial.
 * avatar_url is "emoji:<emoji>:<#color>" or "data:image/...".
 */

export const AVATAR_EMOJI = ['🥩', '🔥', '🍖', '🥢', '🍚', '🌶️', '🥬', '🍻', '🍶', '🧋', '🍜', '🥟', '🐯', '🐻', '🐰', '🦊', '🐼', '🐶', '🐱', '🐸', '😎', '🤠', '👑', '⭐'];
export const AVATAR_COLORS = ['#be1e2d', '#d95926', '#d9a53a', '#3f8f5a', '#2f7f86', '#3987e5', '#6d5bd0', '#b04f8f', '#57504a'];

export function parseAvatar(url?: string | null): { kind: 'photo'; src: string } | { kind: 'emoji'; emoji: string; color: string } | null {
  if (!url) return null;
  if (url.startsWith('data:image/')) return { kind: 'photo', src: url };
  if (url.startsWith('emoji:')) {
    const rest = url.slice(6);
    const i = rest.lastIndexOf(':');
    if (i > 0) return { kind: 'emoji', emoji: rest.slice(0, i), color: rest.slice(i + 1) };
  }
  return null;
}

export const emojiAvatar = (emoji: string, color: string) => `emoji:${emoji}:${color}`;

export function Avatar({ name, url, size = 'h-10 w-10 text-base', className = '' }: { name: string; url?: string | null; size?: string; className?: string }) {
  const a = parseAvatar(url);
  const base = `flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold text-white ${size} ${className}`;
  if (a?.kind === 'photo') return <img src={a.src} alt="" className={`${base} object-cover`} />;
  if (a?.kind === 'emoji')
    return (
      <span className={base} style={{ background: `radial-gradient(circle at 30% 25%, ${a.color}ee, ${a.color}99 70%)` }} aria-hidden>
        <span className="leading-none" style={{ fontSize: '1.15em' }}>
          {a.emoji}
        </span>
      </span>
    );
  return <span className={`${base} bg-gradient-to-br from-sky-500 to-sky-800`}>{(name.trim()[0] ?? '?').toUpperCase()}</span>;
}

/** Shrinks a chosen photo to a 128 x 128 square JPEG (a few KB) so it can live in the profile row. */
export async function photoToAvatar(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file.');
  const img = await createImageBitmap(file);
  const side = Math.min(img.width, img.height);
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 128, 128);
  img.close();
  return c.toDataURL('image/jpeg', 0.82);
}
