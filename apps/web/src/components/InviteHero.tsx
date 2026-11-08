import { Users } from 'lucide-react';
import { Avatar } from './Avatar';
import { HabitIcon, habitColor } from './HabitIcon';

interface Props {
  color: string;
  icon: string | null;
  people: { id: number; name: string; photoUrl?: string | null }[];
}

/** The glowing circle with the habit icon and floating avatars from the invite mockup. */
export function InviteHero({ color, icon, people }: Props) {
  const accent = habitColor(color);
  const [a, b] = people;
  return (
    <div className="relative mx-auto h-[300px] w-[320px] max-w-full" aria-hidden>
      <div className="absolute top-[40px] left-1/2 size-[230px] -translate-x-1/2 rounded-full blur-[60px]" style={{ background: `color-mix(in srgb, ${accent} 25%, transparent)` }} />
      <div className="absolute top-[70px] left-1/2 flex size-[170px] -translate-x-1/2 items-center justify-center rounded-full border border-line bg-surface-2 text-ink">
        {icon ? <HabitIcon name={icon} size={68} strokeWidth={2.4} /> : <Users size={64} strokeWidth={2.2} />}
      </div>
      {a && (
        <span className="absolute top-[40px] right-[30px]">
          <Avatar id={a.id} name={a.name} photoUrl={a.photoUrl} size={80} ring />
        </span>
      )}
      {b && (
        <span className="absolute top-[200px] right-[22px]">
          <Avatar id={b.id} name={b.name} photoUrl={b.photoUrl} size={68} ring />
        </span>
      )}
    </div>
  );
}
