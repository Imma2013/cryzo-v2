/**
 * Lightweight cron expression parser and next-run calculator.
 * Adapted from Paperclip (MIT License) — https://github.com/paperclipai/paperclip
 *
 * Supports standard 5-field cron expressions:
 *   minute (0–59)  hour (0–23)  day-of-month (1–31)  month (1–12)  day-of-week (0–6, Sun=0)
 */

export interface ParsedCron {
  minutes: number[];
  hours: number[];
  daysOfMonth: number[];
  months: number[];
  daysOfWeek: number[];
}

interface FieldSpec {
  min: number;
  max: number;
  name: string;
}

const FIELD_SPECS: FieldSpec[] = [
  { min: 0, max: 59, name: "minute" },
  { min: 0, max: 23, name: "hour" },
  { min: 1, max: 31, name: "day of month" },
  { min: 1, max: 12, name: "month" },
  { min: 0, max: 6, name: "day of week" },
];

function parseField(token: string, spec: FieldSpec): number[] {
  const values = new Set<number>();
  const parts = token.split(",");

  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed === "") throw new Error(`Empty element in cron ${spec.name} field`);

    const slashIdx = trimmed.indexOf("/");
    if (slashIdx !== -1) {
      const base = trimmed.slice(0, slashIdx);
      const step = parseInt(trimmed.slice(slashIdx + 1), 10);
      if (isNaN(step) || step <= 0) throw new Error(`Invalid step in cron ${spec.name} field`);

      let rangeStart = spec.min;
      let rangeEnd = spec.max;

      if (base === "*") {
        /* */
      } else if (base.includes("-")) {
        const [a, b] = base.split("-").map((s) => parseInt(s, 10));
        if (isNaN(a!) || isNaN(b!)) throw new Error(`Invalid range in cron ${spec.name} field`);
        rangeStart = a!;
        rangeEnd = b!;
      } else {
        const start = parseInt(base, 10);
        if (isNaN(start)) throw new Error(`Invalid start in cron ${spec.name} field`);
        rangeStart = start;
      }

      for (let i = rangeStart; i <= rangeEnd; i += step) values.add(i);
      continue;
    }

    if (trimmed.includes("-")) {
      const [a, b] = trimmed.split("-").map((s) => parseInt(s, 10));
      if (isNaN(a!) || isNaN(b!)) throw new Error(`Invalid range in cron ${spec.name} field`);
      for (let i = a!; i <= b!; i++) values.add(i);
      continue;
    }

    if (trimmed === "*") {
      for (let i = spec.min; i <= spec.max; i++) values.add(i);
      continue;
    }

    const val = parseInt(trimmed, 10);
    if (isNaN(val)) throw new Error(`Invalid value in cron ${spec.name} field`);
    values.add(val);
  }

  return [...values].sort((a, b) => a - b);
}

export function parseCron(expression: string): ParsedCron {
  const tokens = expression.trim().split(/\s+/);
  if (tokens.length !== 5) throw new Error(`Cron expression must have 5 fields, got ${tokens.length}`);

  return {
    minutes: parseField(tokens[0]!, FIELD_SPECS[0]!),
    hours: parseField(tokens[1]!, FIELD_SPECS[1]!),
    daysOfMonth: parseField(tokens[2]!, FIELD_SPECS[2]!),
    months: parseField(tokens[3]!, FIELD_SPECS[3]!),
    daysOfWeek: parseField(tokens[4]!, FIELD_SPECS[4]!),
  };
}

function findNext(sortedValues: number[], current: number): number | null {
  for (const v of sortedValues) {
    if (v > current) return v;
  }
  return null;
}

function advanceToNextMonth(d: Date, months: number[]): void {
  let year = d.getUTCFullYear();
  let month = d.getUTCMonth() + 1;
  for (let i = 0; i < 48; i++) {
    month++;
    if (month > 12) { month = 1; year++; }
    if (months.includes(month)) {
      d.setUTCFullYear(year, month - 1, 1);
      d.setUTCHours(0, 0, 0, 0);
      return;
    }
  }
}

export function nextCronTick(cron: ParsedCron, after: Date): Date | null {
  const d = new Date(after.getTime());
  d.setUTCSeconds(0, 0);
  d.setUTCMinutes(d.getUTCMinutes() + 1);

  const maxIterations = 4 * 366 * 24 * 60;

  for (let i = 0; i < maxIterations; i++) {
    const month = d.getUTCMonth() + 1;
    const dayOfMonth = d.getUTCDate();
    const dayOfWeek = d.getUTCDay();
    const hour = d.getUTCHours();
    const minute = d.getUTCMinutes();

    if (!cron.months.includes(month)) { advanceToNextMonth(d, cron.months); continue; }
    if (!cron.daysOfMonth.includes(dayOfMonth) || !cron.daysOfWeek.includes(dayOfWeek)) {
      d.setUTCDate(d.getUTCDate() + 1); d.setUTCHours(0, 0, 0, 0); continue;
    }
    if (!cron.hours.includes(hour)) {
      const next = findNext(cron.hours, hour);
      if (next !== null) { d.setUTCHours(next, 0, 0, 0); } else { d.setUTCDate(d.getUTCDate() + 1); d.setUTCHours(0, 0, 0, 0); }
      continue;
    }
    if (!cron.minutes.includes(minute)) {
      const next = findNext(cron.minutes, minute);
      if (next !== null) { d.setUTCMinutes(next, 0, 0); } else { d.setUTCHours(d.getUTCHours() + 1, 0, 0, 0); }
      continue;
    }

    return new Date(d.getTime());
  }

  return null;
}

export function nextCronTickFromExpression(expression: string, after: Date = new Date()): Date | null {
  return nextCronTick(parseCron(expression), after);
}

export function validateCron(expression: string): string | null {
  try { parseCron(expression); return null; } catch (err) { return err instanceof Error ? err.message : String(err); }
}
