/*
 * Demo data for screenshots: four people, a few months of history, shared and personal habits.
 * Built through the real services (not hand-written JSON), so it obeys every rule the app enforces.
 *
 *   npx tsx scripts/demo-data.ts [.data/demo.json]
 *
 * Then run the API on it (DATA_FILE=.data/demo.json) and the Mini App as Alex (DEV_USER_ID=1001).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createApp, MemoryStore, type HabitInput } from '@habit/core';

const OUT = resolve(import.meta.dirname, '..', process.argv[2] ?? '.data/demo.json');
const TIME_ZONE = 'Europe/London';
const HISTORY_DAYS = 150;
/** The demo's main habit keeps an unbroken run this long, so the streak badge has something to show. */
const RUN_STREAK_DAYS = 23;
const DAY_MS = 86_400_000;

const ALEX = 1001;
const SAM = 1002;
const MIA = 1003;
const JORDAN = 1004;

// Fixed-seed randomness: every run produces the same history, so screenshots stay comparable.
let seed = 20261108;
const random = () => {
  seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31;
  return seed / 2 ** 31;
};

const store = new MemoryStore();
let now = new Date();
const app = createApp({ store, clock: { now: () => now }, notifier: { send: async () => {} } });

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
/** London is UTC in winter and UTC+1 in summer; daytime hours land on the same date either way. */
const at = (date: string, hour: number, minute = 0) =>
  new Date(`${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`);
const isoWeekday = (date: string) => ((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;

const today = iso(Date.now());
const day = (offset: number) => iso(Date.parse(`${today}T12:00:00Z`) + offset * DAY_MS);
const START = -HISTORY_DAYS;

async function person(id: number, firstName: string) {
  await app.users.upsertFromTelegram({ id, first_name: firstName, language_code: 'en' }, TIME_ZONE);
  await app.users.updateSettings(id, { language: 'en', timeZone: TIME_ZONE });
}

/** `joiner` opens `owner`'s link (a friend link, or a habit link) and the owner approves. */
async function join(owner: number, joiner: number, habitId: string | null) {
  const link = await app.social.getInviteLink(owner, habitId);
  const outcome = await app.social.requestByToken(joiner, link.token);
  if (outcome.status !== 'requested') throw new Error(`join ${joiner} → ${habitId ?? 'friends'}: ${outcome.status}`);
  await app.social.approve(owner, outcome.request.id);
}

interface DemoHabit {
  owner: number;
  createdOn: number;
  input: HabitInput;
  /** Who joins and on which day offset. */
  members: [number, number][];
  /** Chance that a member checks a scheduled day. */
  rate: number;
  /** Alex's state today: shows both done and still-open cards on the home screen. */
  doneToday: number[];
  id?: string;
}

const habits: DemoHabit[] = [
  {
    owner: ALEX, createdOn: START, members: [[SAM, START + 2]], rate: 0.86, doneToday: [ALEX, SAM],
    input: { title: 'Morning run', icon: 'run', color: 'coral', frequency: { type: 'daily' }, completionMode: 'all', visibility: 'friends' },
  },
  {
    owner: ALEX, createdOn: START + 6, members: [], rate: 0.8, doneToday: [ALEX],
    input: { title: 'Read 20 pages', icon: 'book', color: 'lavender', frequency: { type: 'daily' }, completionMode: 'all', visibility: 'friends' },
  },
  {
    owner: ALEX, createdOn: START + 14, members: [[SAM, START + 15], [MIA, START + 30]], rate: 0.55, doneToday: [MIA],
    input: { title: 'Gym', icon: 'dumbbell', color: 'sky', frequency: { type: 'weekly', times: 3 }, completionMode: 'any', visibility: 'friends' },
  },
  {
    owner: MIA, createdOn: START + 20, members: [[ALEX, START + 21]], rate: 0.78, doneToday: [MIA],
    input: { title: 'Spanish', icon: 'pen', color: 'gold', frequency: { type: 'daily' }, completionMode: 'all', visibility: 'friends' },
  },
  {
    owner: ALEX, createdOn: START + 35, members: [[MIA, START + 36]], rate: 0.82, doneToday: [],
    input: { title: 'Meditate', icon: 'brain', color: 'mint', frequency: { type: 'weekdays', days: [1, 2, 3, 4, 5] }, completionMode: 'all', visibility: 'friends' },
  },
  {
    owner: ALEX, createdOn: START + 70, members: [], rate: 0.74, doneToday: [],
    input: { title: 'No sugar', icon: 'apple', color: 'green', frequency: { type: 'daily' }, completionMode: 'all', visibility: 'private' },
  },
];

function scheduled(habit: DemoHabit, date: string): boolean {
  const f = habit.input.frequency;
  if (f.type === 'weekdays') return f.days.includes(isoWeekday(date));
  if (f.type === 'weekly') return [1, 3, 5].includes(isoWeekday(date)) || random() < 0.1;
  return true;
}

async function main() {
  now = at(day(START), 8);
  await person(ALEX, 'Alex');
  await person(SAM, 'Sam');
  await person(MIA, 'Mia');
  await person(JORDAN, 'Jordan');
  await join(ALEX, SAM, null);
  await join(ALEX, MIA, null);

  const joined = new Map<string, number>(); // `${habitIndex}:${userId}` → day offset

  for (let offset = START; offset <= 0; offset++) {
    const date = day(offset);

    for (const [index, habit] of habits.entries()) {
      if (habit.createdOn === offset) {
        now = at(date, 8, 5);
        habit.id = (await app.habits.create(habit.owner, habit.input)).id;
        joined.set(`${index}:${habit.owner}`, offset);
      }
      for (const [member, on] of habit.members) {
        if (on !== offset || !habit.id) continue;
        now = at(date, 9, 10);
        await join(habit.owner, member, habit.id);
        joined.set(`${index}:${member}`, offset);
      }
    }

    for (const [index, habit] of habits.entries()) {
      if (!habit.id) continue;
      for (const member of [habit.owner, ...habit.members.map(([m]) => m)]) {
        const since = joined.get(`${index}:${member}`);
        if (since === undefined || since > offset) continue;
        const streakDay = index === 0 && offset > -RUN_STREAK_DAYS;
        const done = offset === 0 ? habit.doneToday.includes(member) : streakDay || (scheduled(habit, date) && random() < habit.rate);
        if (!done) continue;
        // Today's checks happen a little before now, earlier days at a plausible hour.
        now = offset === 0 ? new Date(Date.now() - (5 + Math.floor(random() * 90)) * 60_000) : at(date, 7 + Math.floor(random() * 13), Math.floor(random() * 60));
        await app.checks.check(member, habit.id, date);
      }
    }
  }

  const run = habits[0]!.id!;
  now = new Date(Date.now() - 3 * 60 * 60_000);
  await app.habits.updateMembership(ALEX, run, { cardSize: 'wide', reminder: { type: 'exact', time: '07:30' } });
  // Something waiting in Alex's requests: Jordan wants into the gym habit.
  const gymLink = await app.social.getInviteLink(ALEX, habits[2]!.id!);
  await app.social.requestByToken(JORDAN, gymLink.token);

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(store.snapshot()));
  const snapshot = store.snapshot();
  console.log(`demo data → ${OUT}: ${snapshot.users.length} users, ${snapshot.habits.length} habits, ${snapshot.checks.length} checks, ${snapshot.events.length} events`);
}

await main();
