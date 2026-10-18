/**
 * What the home-screen penguin feels, says and offers, given today's snapshot
 * and the time. Pure (no React Native), so the whole day's timeline is unit
 * testable. Tone: sarcastic, never insulting, and never about real hardship —
 * after a sick or emergency excuse he's only kind.
 */
import type { WidgetMood } from '@/constants/widgetArt';

export interface MoodSnapshot {
  date: string;
  streak: number;
  status: 'done' | 'in_progress' | 'scheduled' | 'skipped' | 'rest' | 'missed';
  time: string | null;
  upcoming: { date: string; time: string }[];
  /** Today's excuse label, when status is 'skipped'. */
  excuse?: string | null;
  /** Whether missing today would actually break the streak (no token, no redemption). */
  atRisk?: boolean;
}

export interface WidgetView {
  mood: WidgetMood;
  line: string;
  /** Frame colour: urgency shows on the widget's border. */
  border: `#${string}`;
}

const pickFrom = (pool: string[], seed: string) => {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) | 0;
  return pool[Math.abs(h) % pool.length];
};

const fill = (s: string, vars: Record<string, string | number>) =>
  s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

const fmt12 = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 || 12;
  return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, '0')}${suffix}`;
};

const dayName = (date: string) =>
  new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' });

const BORDER = {
  quiet: '#262626',
  go: '#A8FF3E',
  alarm: '#FF3131',
  gold: '#FFC93E',
} as const;

/** Roasts for the excuse you gave. Sick and emergency are never roasted. */
const EXCUSE_LINES: Record<string, string[]> = {
  'Bad Weather': ['Weather? The gym has a roof.', 'You are not made of sugar.'],
  'Feeling Unmotivated / Tired': ['Tired. Coffee exists.', 'Motivation is overrated. Noted.'],
  'Too Busy / Ran Out of Time': ['Busy. Sure.', 'Too busy. For 45 minutes. Okay.'],
  'Work Commitments': ['Work again. Noted.', 'Your boss owes me a workout.'],
  'Not Having a Gym Buddy': ["I'm your buddy. Go.", 'Lonely? Bring me.'],
  'Too Sore / Need Recovery': ['Sore. Fine. Stretch at least.', 'Recovery day. I see it.'],
  'Feeling Anxious': ['Rough day. Tomorrow, then.', 'Take a breath. Back at it soon.'],
  'Discouraged by Lack of Progress': ['Progress takes showing up.', 'Results lag. Keep going.'],
  'Family / Social Plans': ['Have fun. I’ll be here. Waiting.', 'Plans. Noted.'],
  Travelling: ['Hotel gyms exist, you know.', 'Safe travels. Squats work anywhere.'],
};
const KIND_EXCUSES = new Set(['Sick / Injured', 'Genuine Emergency']);

export function computeWidgetView(snap: MoodSnapshot | null, now: Date): WidgetView {
  if (!snap) {
    return { mood: 'hyped', line: 'Open NoWomp to wake me up.', border: BORDER.quiet };
  }

  const nowMin = now.getHours() * 60 + now.getMinutes();
  // Line choice rotates every half hour so he doesn't repeat himself.
  const seed = `${snap.date}-${Math.floor(nowMin / 30)}`;
  const say = (pool: string[], vars: Record<string, string | number> = {}) =>
    fill(pickFrom(pool, seed + pool[0]), { streak: snap.streak, ...vars });
  const next = snap.upcoming.find((u) => u.date > snap.date);
  const nextText = next ? `${dayName(next.date)} ${fmt12(next.time)}` : null;

  switch (snap.status) {
    case 'done':
      return {
        mood: 'done',
        line: say(['Untouchable today.', 'Streak {streak}. Fear me.', "That's how it's done.", 'Powered up. See you next time.']),
        border: BORDER.gold,
      };

    case 'in_progress':
      return {
        mood: 'hyped',
        line: say(["Workout running. Don't stop now.", "I'm timing you. Keep going.", 'Every rep counts. Go.']),
        border: BORDER.go,
      };

    case 'missed':
      return {
        mood: 'couch',
        line: say(['Womp womp.', 'I waited. You didn’t come.', 'You owe me an explanation.']),
        border: BORDER.alarm,
      };

    case 'skipped': {
      if (snap.excuse && KIND_EXCUSES.has(snap.excuse)) {
        return { mood: 'caring', line: say(['Get well. 🫶', 'Take care. Back soon.', 'Rest up. I’ve got your streak.']), border: BORDER.quiet };
      }
      return {
        mood: 'unimpressed',
        line: say(EXCUSE_LINES[snap.excuse ?? ''] ?? ['Excuse noted. 😒', 'Hmm. Okay.']),
        border: BORDER.quiet,
      };
    }

    case 'rest':
      if (!nextText) {
        return {
          mood: 'unimpressed',
          line: say(['Nothing scheduled. Suspicious.', 'No plans? Convenient.', 'An empty calendar. Bold.']),
          border: BORDER.quiet,
        };
      }
      return {
        mood: 'sleepy',
        line: say(['Rest day. Enjoy it… for now.', 'Recharge. Next: {next}.', 'Day off. Back at it {next}.'], { next: nextText }),
        border: BORDER.quiet,
      };

    case 'scheduled': {
      const t = snap.time ?? '18:00';
      const until = toMinutes(t) - nowMin;
      const span = (mins: number) =>
        mins >= 60 ? `${Math.floor(mins / 60)}h${mins % 60 ? ` ${mins % 60}m` : ''}` : `${mins} min`;
      const vars = {
        t: fmt12(t),
        now: fmt12(`${now.getHours()}:${now.getMinutes()}`),
        late: until < 0 ? span(-until) : '',
        left: span(Math.max(0, until)),
      };
      if (until > 120) {
        return {
          mood: 'hyped',
          line: say(["Gym at {t}. Don't make me wait.", "{t} today. I'll be watching.", 'Big day. {t}. Be there.'], vars),
          border: BORDER.quiet,
        };
      }
      if (until > 30) {
        return {
          mood: 'waiting',
          line: say(['{left} to go. Pack the bag. 🎒', 'Shoes. Bottle. Towel. {t}.', 'Leaving soon, right? {t}.'], vars),
          border: BORDER.go,
        };
      }
      if (until >= 0) {
        return {
          mood: 'urgent',
          line: say(["It's time. GET UP.", '{t}. That means now.', 'Door. Gym. Go.'], vars),
          border: BORDER.alarm,
        };
      }
      // Late. After 9pm, panic — but only claim the streak dies if it really would.
      if (nowMin >= 21 * 60) {
        return {
          mood: 'crying',
          line: snap.atRisk
            ? say(['Streak {streak} dies at midnight.', '{streak} gone at midnight. 😭'], vars)
            : say(["Midnight's coming. Hurry.", 'Still time. Barely.'], vars),
          border: BORDER.alarm,
        };
      }
      return {
        mood: 'angry',
        line: say(['You said {t}. It’s {now}.', '{late} late. I’m counting.', 'The gym called. It’s lonely.'], vars),
        border: BORDER.alarm,
      };
    }
  }
}

/** Escalating replies to being poked. */
const POKES = [
  'What?',
  'Hey.',
  'Stop poking me and go.',
  'I bite.',
  "I'm telling your future self.",
  'Okay. That’s it. GYM.',
];

export function pokeView(count: number): WidgetView {
  const line = POKES[Math.min(count - 1, POKES.length - 1)];
  return { mood: count >= 4 ? 'angry' : 'poked', line, border: count >= 4 ? BORDER.alarm : BORDER.quiet };
}
