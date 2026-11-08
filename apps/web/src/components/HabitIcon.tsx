import {
  Apple, Bed, Bike, BookOpen, Brain, Code, Droplet, Dumbbell, Footprints, Heart, Leaf, Moon, Music, PenLine, Pill, Smile, Sun, Zap,
  type LucideIcon,
} from 'lucide-react';

/** Icons a habit can use. Keys are stored in the backend (lowercase, dashes). */
export const HABIT_ICONS: Record<string, LucideIcon> = {
  zap: Zap,
  dumbbell: Dumbbell,
  book: BookOpen,
  heart: Heart,
  droplet: Droplet,
  moon: Moon,
  sun: Sun,
  run: Footprints,
  bike: Bike,
  brain: Brain,
  leaf: Leaf,
  music: Music,
  pen: PenLine,
  code: Code,
  apple: Apple,
  pill: Pill,
  bed: Bed,
  smile: Smile,
};

export const HABIT_COLORS = ['coral', 'mint', 'lavender', 'pink', 'sky', 'green', 'peach', 'gold'] as const;

/** CSS custom property value for a habit color, resolved per theme in styles.css. */
export const habitColor = (color: string) => `var(--h-${color})`;

export function HabitIcon({ name, size = 22, strokeWidth = 2 }: { name: string; size?: number; strokeWidth?: number }) {
  const Icon = HABIT_ICONS[name] ?? Zap;
  return <Icon size={size} strokeWidth={strokeWidth} aria-hidden />;
}
