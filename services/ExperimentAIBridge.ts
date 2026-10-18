import {
  BLOCK_COUNT,
  BLOCK_DAYS,
  METRICS,
  METRIC_ORDER,
  MIN_COMPLIANCE,
  type MetricId,
} from '@/constants/experiments';
import type { Experiment, LibraryEntry, MetricResult } from './ExperimentService';

/**
 * A copy-paste bridge to whichever AI the user likes (ChatGPT, Claude, …).
 * NoWomp never calls an AI itself and stays offline: it builds a prompt for
 * the user to paste, and reads back the experiment the AI designs — either as
 * a `nowomp://experiments?...` link or a JSON block.
 */

export interface ImportedExperiment {
  title: string;
  rule: string;
  offRule: string;
  hypothesis: string;
  primary: MetricId;
  secondary: MetricId[];
}

const isMetric = (v: unknown): v is MetricId => typeof v === 'string' && v in METRICS;

const clean = (v: unknown, max: number) =>
  typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';

/** Validate whatever came back; anything unusable returns null rather than half-filling the form. */
function normalise(raw: Record<string, unknown>): ImportedExperiment | null {
  const title = clean(raw.title, 40);
  const rule = clean(raw.rule, 160);
  const primary = clean(raw.primary, 40);
  if (!title || rule.length < 4 || !isMetric(primary)) return null;
  const secondaryRaw = Array.isArray(raw.secondary)
    ? raw.secondary
    : typeof raw.secondary === 'string'
      ? raw.secondary.split(',')
      : [];
  const secondary = secondaryRaw
    .map((s) => clean(s, 40))
    .filter(isMetric)
    .filter((m, i, a) => m !== primary && a.indexOf(m) === i)
    .slice(0, 3);
  return {
    title,
    rule,
    offRule: clean(raw.off ?? raw.offRule ?? raw.off_rule, 160) || 'Live as you normally would.',
    hypothesis: clean(raw.hypothesis, 200) || `${rule.replace(/\.$/, '')} improves ${METRICS[primary].label.toLowerCase()}.`,
    primary,
    secondary,
  };
}

/** Accepts a nowomp:// link, a JSON object, or a reply that contains either. */
export function parseExperimentText(text: string): ImportedExperiment | null {
  const link = text.match(/nowomp:\/\/experiments\?[^\s)"'<>]+/);
  if (link) {
    const query = link[0].split('?')[1] ?? '';
    const params: Record<string, string> = {};
    for (const part of query.split('&')) {
      const [k, v = ''] = part.split('=');
      try {
        params[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' '));
      } catch {}
    }
    const parsed = normalise(params);
    if (parsed) return parsed;
  }
  const json = text.match(/\{[\s\S]*\}/);
  if (json) {
    try {
      return normalise(JSON.parse(json[0]));
    } catch {}
  }
  return null;
}

/** Route params from a tapped nowomp://experiments link. */
export function fromRouteParams(params: Record<string, string | string[] | undefined>): ImportedExperiment | null {
  if (!params.title || !params.rule) return null;
  const flat: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) flat[k] = Array.isArray(v) ? v[0] : v;
  return normalise(flat);
}

export function buildDesignPrompt(available: Record<MetricId, boolean>, library: LibraryEntry[]): string {
  const metrics = METRIC_ORDER.map(
    (id) =>
      `- ${id}: ${METRICS[id].label} (${METRICS[id].better} is better)${available[id] ? '' : ' — NO DATA, do not use'}`
  ).join('\n');
  const signals = library
    .filter((e) => e.suggestion)
    .map((e) => `- ${e.suggestion!.reason}`)
    .join('\n');
  return `I use a fitness accountability app called NoWomp that runs personal N-of-1 experiments. Help me design one.

How the app runs an experiment:
- ${BLOCK_COUNT} blocks of ${BLOCK_DAYS} days, alternating "rule on" and "rule off" (ABAB), order randomised.
- I check in daily on whether I followed the plan; under ${Math.round(MIN_COMPLIANCE * 100)}% compliance the result is unreliable.
- One main measure is locked at the start. A change only counts if it beats my normal day-to-day noise and repeats in both rule-on weeks.

Measures the app can track (use the ids exactly):
${metrics}

What my data shows right now:
${signals || '- Nothing notable yet.'}

Ask me one or two questions about what I want to improve, then suggest ONE experiment. The rule must be concrete and doable daily for a week, and the "rule off" week must be my normal behaviour.

When we've agreed, reply with this link on its own line, URL-encoded, so I can tap it to load the experiment:
nowomp://experiments?title=SHORT_NAME&rule=WHAT_TO_DO_ON_RULE_ON_DAYS&off=WHAT_TO_DO_ON_RULE_OFF_DAYS&primary=METRIC_ID&secondary=METRIC_ID,METRIC_ID&hypothesis=ONE_SENTENCE

Also give the same thing as JSON (keys: title, rule, off, primary, secondary, hypothesis) in case the link doesn't work.`;
}

const fmt = (r: MetricResult, v: number | null) => {
  if (v == null) return 'n/a';
  const unit = METRICS[r.metric].unit;
  return unit === 'min' ? `${Math.round(v)} min` : unit === '%' ? `${Math.round(v)}%` : `${v.toFixed(1)} ${unit}`;
};

export function buildResultsPrompt(exp: Experiment): string {
  const r = exp.result;
  if (!r) return '';
  const line = (m: MetricResult) =>
    `- ${METRICS[m.metric].label}: rule-on ${fmt(m, m.onMean)} (${m.nOn} days) vs rule-off ${fmt(m, m.offMean)} (${m.nOff} days); difference ${fmt(m, m.diff)}; noise threshold ${fmt(m, m.threshold)}; consistent across weeks: ${m.consistent ? 'yes' : 'no'}; weekly means: ${m.blockMeans
      .map((b) => (b == null ? 'n/a' : fmt(m, b)))
      .join(' / ')}; app verdict: ${m.verdict}.`;
  return `I ran a 4-week ABAB self-experiment in my fitness app (NoWomp). Help me understand the result and decide what to do next.

Experiment: ${exp.title}
Hypothesis: ${exp.hypothesis}
Rule on: ${exp.rule}
Rule off: ${exp.off_rule}
Week order: ${exp.schedule.map((p) => (p === 'B' ? 'ON' : 'OFF')).join(', ')}
Compliance: ${Math.round(r.compliance * 100)}% of days followed the plan.

Main measure:
${line(r.primary)}

Also tracked:
${r.secondary.map(line).join('\n') || '- none'}

Possible confounders the app flagged:
${r.flags.map((f) => `- ${f}`).join('\n') || '- none'}

Explain in plain language what this suggests for me, how confident I should be (it's one person, no blinding), and whether to adopt the habit, drop it, or re-run the experiment differently.`;
}
