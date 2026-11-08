import { useState } from 'react';
import { avatarGradient, initialOf } from '../lib/format';

interface Props {
  id: number;
  name: string;
  photoUrl?: string | null;
  size?: number;
  ring?: boolean;
}

/** Telegram photo when available, otherwise a stable gradient with the initial. */
export function Avatar({ id, name, photoUrl, size = 28, ring = false }: Props) {
  const [broken, setBroken] = useState(false);
  const style = { width: size, height: size, fontSize: Math.round(size * 0.42) };
  const ringClass = ring ? 'ring-2 ring-surface' : '';
  if (photoUrl && !broken) {
    return (
      <img
        src={photoUrl}
        alt=""
        width={size}
        height={size}
        style={style}
        onError={() => setBroken(true)}
        className={`shrink-0 rounded-full object-cover ${ringClass}`}
      />
    );
  }
  return (
    <span
      aria-hidden
      style={{ ...style, background: avatarGradient(id) }}
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${ringClass}`}
    >
      {initialOf(name)}
    </span>
  );
}

export function AvatarStack({ people, size = 28, max = 3 }: { people: { id: number; name: string; photoUrl?: string | null }[]; size?: number; max?: number }) {
  const shown = people.slice(0, max);
  return (
    <span className="flex items-center">
      {shown.map((p, i) => (
        <span key={p.id} style={{ marginLeft: i === 0 ? 0 : -size * 0.28 }}>
          <Avatar id={p.id} name={p.name} photoUrl={p.photoUrl} size={size} ring />
        </span>
      ))}
    </span>
  );
}
