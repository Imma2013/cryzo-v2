/**
 * Lightweight cron expression parser and next-run calculator.
 * Adapted from Paperclip (MIT) — github.com/paperclipai/paperclip
 *
 * Standard 5-field cron: minute hour day-of-month month day-of-week
 */

export interface ParsedCron {
  minutes: number[];
  hours: number[];
  daysOfMonth: number[];
  months: number[];
  daysOfWeek: number[];
}

const FIELD_SPECS = [
  { min: 0, max: 59, name: "minute" },
  { min: 0, max: 23, name: "hour" },
  { min: 1, max: 31, name: "day of month" },
  { min: 1, max: 12, name: "month" },
  { min: 0, max: 6, name: "day of week" },
] as const;

function parseField(token: string, spec: { min: number; max: number; name: string }): number[] {
  const values = new Set<number>();

  for (const part of token.split(",")) {
    const t = part.trim();
    if (!t) throw new Error(`Empty element in cron ${spec.name} field`);

    const slashIdx = t.indexOf("/");
    if (slashIdx !== -1) {
      const base = t.slice(0, slashIdx);
      const step = parseInt(t.slice(slashIdx + 1), 10);
      if (isNaN(step) || step <= 0) throw new Error(`Invalid step in cron ${spec.name}`);
      let start = spec.min, end = spec.max;
      if (base !== "*") {
        if (base.includes("-")) {
          const [a, b] = base.split("-").map(Number);
          start = a!; end = b!;
        } else {
          start = parseInt(base, 10);
        }
      }
      for (let i = start; i <= end; i += step) values.add(i);
      continue;
    }

    if (t.includes("-")) {
      const [a, b] = t.split("-").map(Number);
      for (let i = a!; i <= b!; i++) values.add(i);
      continue;
    }

    if (t === "*") {
      for (let i = spec.min; i <= spec.max; i++) values.add(i);
      continue;
    }

    values.add(parseInt(t, 10));
  }

  return [...values].sort((a, b) => a - b);
}

export function parseCron(expression: string): ParsedCron {
  const tokens = expression.trim().split(/\s+/);
  if (tokens.length !== 5) throw new Error(`Cron must have 5 fields, got ${tokens.length}`);
  return {
    minutes: parseField(tokens[0]!, FIELD_SPECS[0]),
    hours: parseField(tokens[1]!, FIELD_SPECS[1]),
    daysOfMonth: parseField(tokens[2]!, FIELD_SPECS[2]),
    months: parseField(tokens[3]!, FIELD_SPECS[3]),
    daysOfWeek: parseField(tokens[4]!, FIELD_SPECS[4]),
  };
}

export function validateCron(expression: string): string | null {
  try { parseCron(expression); return null; }
  catch (e) { return e instanceof Error ? e.message : String(e); }
}

function findNext(sorted: number[], current: number): number | null {
  for (const v of sorted) if (v > current) return v;
  return null;
}

export function nextCronTick(cron: ParsedCron, after: Date): Date | null {
  const d = new Date(after.getTime());
  d.setUTCSeconds(0, 0);
  d.setUTCMinutes(d.getUTCMinutes() + 1);

  for (let i = 0; i < 4 * 366 * 24 * 60; i++) {
    const month = d.getUTCMonth() + 1;
    const dom = d.getUTCDate();
    const dow = d.getUTCDay();
    const hour = d.getUTCHours();
    const min = d.getUTCMinutes();

    if (!cron.months.includes(month)) {
      let y = d.getUTCFullYear(), m = month;
      for (let j = 0; j < 48; j++) {
        m++; if (m > 12) { m = 1; y++; }
        if (cron.months.includes(m)) { d.setUTCFullYear(y, m - 1, 1); d.setUTCHours(0, 0, 0, 0); break; }
      }
      continue;
    }
    if (!cron.daysOfMonth.includes(dom) || !cron.daysOfWeek.includes(dow)) {
      d.setUTCDate(d.getUTCDate() + 1); d.setUTCHours(0, 0, 0, 0); continue;
    }
    if (!cron.hours.includes(hour)) {
      const next = findNext(cron.hours, hour);
      if (next !== null) d.setUTCHours(next, 0, 0, 0);
      else { d.setUTCDate(d.getUTCDate() + 1); d.setUTCHours(0, 0, 0, 0); }
      continue;
    }
    if (!cron.minutes.includes(min)) {
      const next = findNext(cron.minutes, min);
      if (next !== null) d.setUTCMinutes(next, 0, 0);
      else d.setUTCHours(d.getUTCHours() + 1, 0, 0, 0);
      continue;
    }
    return new Date(d.getTime());
  }
  return null;
}

export function nextCronTickFromExpression(expr: string, after: Date = new Date()): Date | null {
  return nextCronTick(parseCron(expr), after);
}

function getTimeZoneParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const get = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

function getTimeZoneOffsetMinutes(date: Date, timeZone: string) {
  const parts = getTimeZoneParts(date, timeZone);
  const utcMs = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return Math.round((utcMs - date.getTime()) / 60000);
}

function normalizeTimezone(timeZone?: string) {
  const raw = (timeZone || "UTC").trim();
  const lower = raw.toLowerCase();

  if (lower.includes("chicago") || lower === "cst" || lower === "cdt") {
    return "America/Chicago";
  }
  if (lower.includes("new york") || lower === "est" || lower === "edt") {
    return "America/New_York";
  }
  if (lower.includes("los angeles") || lower === "pst" || lower === "pdt") {
    return "America/Los_Angeles";
  }

  return raw || "UTC";
}

function parseClock(text: string) {
  const match = text.match(
    /\b(?:at\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i,
  );
  if (!match) {
    return null;
  }

  let hour = Number(match[1]);
  const minute = Number(match[2] ?? "0");
  const meridiem = match[3]?.toLowerCase();

  if (Number.isNaN(hour) || Number.isNaN(minute) || minute > 59) {
    return null;
  }

  if (meridiem === "am") {
    hour = hour % 12;
  } else if (meridiem === "pm") {
    hour = (hour % 12) + 12;
  }

  if (hour > 23) {
    return null;
  }

  return { hour, minute };
}

function localTimeToUtcHourMinute(hour: number, minute: number, timeZone: string) {
  const now = new Date();
  const offsetMinutes = getTimeZoneOffsetMinutes(now, timeZone);
  const totalLocalMinutes = hour * 60 + minute;
  const totalUtcMinutes = ((totalLocalMinutes - offsetMinutes) % 1440 + 1440) % 1440;

  return {
    hour: Math.floor(totalUtcMinutes / 60),
    minute: totalUtcMinutes % 60,
  };
}

export function deriveCronFromText(input: {
  cron?: string;
  scheduleText?: string;
  instruction?: string;
  title?: string;
  timezone?: string;
}) {
  const explicitCron = input.cron?.trim();
  if (explicitCron) {
    return explicitCron;
  }

  const combined = [
    input.scheduleText,
    input.instruction,
    input.title,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  if (!combined) {
    return null;
  }

  const text = combined.toLowerCase();
  const timeZone = normalizeTimezone(input.timezone);
  const parsedTime =
    parseClock(text) ||
    (text.includes("morning")
      ? { hour: 8, minute: 0 }
      : text.includes("noon")
        ? { hour: 12, minute: 0 }
        : text.includes("afternoon")
          ? { hour: 15, minute: 0 }
          : text.includes("evening")
            ? { hour: 18, minute: 0 }
            : null);

  const time = parsedTime ?? { hour: 9, minute: 0 };
  const utc = localTimeToUtcHourMinute(time.hour, time.minute, timeZone);

  const weekdayMap: Record<string, number> = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  };

  for (const [day, value] of Object.entries(weekdayMap)) {
    if (text.includes(`every ${day}`) || text.includes(`on ${day}`)) {
      return `${utc.minute} ${utc.hour} * * ${value}`;
    }
  }

  if (text.includes("weekday") || text.includes("weekdays")) {
    return `${utc.minute} ${utc.hour} * * 1-5`;
  }

  if (text.includes("hourly") || text.includes("every hour")) {
    return `0 * * * *`;
  }

  if (text.includes("daily") || text.includes("every day") || text.includes("every morning")) {
    return `${utc.minute} ${utc.hour} * * *`;
  }

  if (text.includes("weekly") || text.includes("every week")) {
    return `${utc.minute} ${utc.hour} * * 1`;
  }

  if (text.includes("monthly") || text.includes("every month")) {
    return `${utc.minute} ${utc.hour} 1 * *`;
  }

  return null;
}
