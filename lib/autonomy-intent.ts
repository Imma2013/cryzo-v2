import type { ToolkitConnection } from "../components/autonomous/autonomous-types";

export type DraftCadence = "hourly" | "daily" | "weekly";
export type DeliveryChannel = "in_app" | "email";
export type TaskRecipeKind =
  | "gmail_unread_digest"
  | "gmail_update"
  | "social_monitor"
  | "analytics_digest"
  | "payment_digest"
  | "general_recurring_task";

export type AutonomousTaskDraft = {
  title: string;
  description: string;
  instruction: string;
  cadence: DraftCadence;
  timeOfDay: string;
  cron: string;
  cronHuman: string;
  timezone: string;
  daysOfWeek: number[];
  integrationSlugs: string[];
  deliveryChannels: DeliveryChannel[];
  goals: string[];
  successCriteria: string[];
  workflowType: TaskRecipeKind;
  sourcePrompt: string;
  missingIntegrationSlugs: string[];
  recipeMetadata?: {
    compiler?: string;
    discoveredToolkits?: string[];
    compiledAt?: string;
  };
};

const recurringPattern =
  /\b(every day|every morning|every afternoon|every evening|every night|daily|hourly|weekly|every week|each morning|each day|every weekday|every monday|every tuesday|every wednesday|every thursday|every friday|every saturday|every sunday)\b/i;

const toolKeywords: Array<{ slug: string; patterns: RegExp[] }> = [
  { slug: "gmail", patterns: [/\bgmail\b/i, /\bemail\b/i, /\bunread emails?\b/i] },
  { slug: "slack", patterns: [/\bslack\b/i] },
  { slug: "linkedin", patterns: [/\blinkedin\b/i] },
  { slug: "metaads", patterns: [/\bmeta ads?\b/i, /\bfacebook ads?\b/i] },
  { slug: "google_analytics", patterns: [/\bga4\b/i, /\bgoogle analytics\b/i] },
  { slug: "stripe", patterns: [/\bstripe\b/i, /\bpayments?\b/i] },
];

const weekdayLookup = new Map<string, number>([
  ["sunday", 0],
  ["monday", 1],
  ["tuesday", 2],
  ["wednesday", 3],
  ["thursday", 4],
  ["friday", 5],
  ["saturday", 6],
]);

export function isRecurringAutonomyPrompt(prompt: string) {
  return recurringPattern.test(prompt);
}

function inferCadence(prompt: string): DraftCadence {
  if (/\bhourly\b/i.test(prompt) || /\bevery hour\b/i.test(prompt)) {
    return "hourly";
  }

  if (/\bweekly\b/i.test(prompt) || /\bevery week\b/i.test(prompt) || /\bevery (monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(prompt)) {
    return "weekly";
  }

  return "daily";
}

function inferTimeOfDay(prompt: string) {
  const explicitMatch = prompt.match(
    /\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i,
  );

  if (explicitMatch) {
    const rawHour = Number(explicitMatch[1]);
    const minute = explicitMatch[2] ?? "00";
    const meridiem = explicitMatch[3].toLowerCase();
    const normalizedHour =
      meridiem === "pm"
        ? rawHour === 12
          ? 12
          : rawHour + 12
        : rawHour === 12
          ? 0
          : rawHour;

    return `${String(normalizedHour).padStart(2, "0")}:${minute}`;
  }

  if (/\bmorning\b/i.test(prompt)) {
    return "08:00";
  }

  if (/\bafternoon\b/i.test(prompt)) {
    return "13:00";
  }

  if (/\bevening\b/i.test(prompt)) {
    return "18:00";
  }

  if (/\bnight\b/i.test(prompt)) {
    return "21:00";
  }

  return "09:00";
}

function inferWeekdays(prompt: string) {
  if (/\bevery weekday\b/i.test(prompt)) {
    return [1, 2, 3, 4, 5];
  }

  const matches = [...prompt.matchAll(/\bevery (monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi)];
  if (matches.length === 0) {
    return [];
  }

  return matches
    .map((match) => weekdayLookup.get(match[1].toLowerCase()))
    .filter((value): value is number => value !== undefined);
}

function inferIntegrations(prompt: string, toolkits: ToolkitConnection[]) {
  const inferred = toolKeywords
    .filter(({ patterns }) => patterns.some((pattern) => pattern.test(prompt)))
    .map(({ slug }) => slug);

  return [...new Set(inferred)];
}

function titleFromPrompt(prompt: string) {
  if (/\bunread\b/i.test(prompt) && /\bgmail|email\b/i.test(prompt)) {
    return "Daily unread Gmail digest";
  }

  if (/\bgmail|email\b/i.test(prompt)) {
    return "Recurring Gmail update";
  }

  return "Recurring autonomous task";
}

function workflowTypeFromPrompt(
  prompt: string,
  integrations: string[],
): TaskRecipeKind {
  if (integrations.includes("gmail") && /\bunread\b/i.test(prompt)) {
    return "gmail_unread_digest";
  }

  if (integrations.includes("gmail")) {
    return "gmail_update";
  }

  if (
    integrations.some((slug) =>
      ["linkedin", "linkedin_ads", "twitter", "tiktok", "reddit", "metaads", "facebook", "instagram"].includes(slug),
    )
  ) {
    return "social_monitor";
  }

  if (integrations.some((slug) => ["google_analytics"].includes(slug))) {
    return "analytics_digest";
  }

  if (integrations.some((slug) => ["stripe"].includes(slug))) {
    return "payment_digest";
  }

  return "general_recurring_task";
}

function descriptionFromWorkflowType(kind: TaskRecipeKind) {
  switch (kind) {
    case "gmail_unread_digest":
      return "A recurring recipe that checks Gmail for unread messages, builds a digest, and delivers it on schedule.";
    case "gmail_update":
      return "A recurring recipe that reviews Gmail updates and sends a scheduled summary.";
    case "social_monitor":
      return "A recurring recipe that checks connected social or ads tools and reports changes on schedule.";
    case "analytics_digest":
      return "A recurring recipe that reviews analytics data and delivers a scheduled digest.";
    case "payment_digest":
      return "A recurring recipe that reviews payment activity and sends a scheduled update.";
    default:
      return "A recurring recipe that runs the requested task on a saved schedule using connected tools.";
  }
}

export function formatWorkflowTypeLabel(kind?: string) {
  switch (kind) {
    case "gmail_unread_digest":
      return "Gmail Digest";
    case "gmail_update":
      return "Gmail Update";
    case "social_monitor":
      return "Social Monitor";
    case "analytics_digest":
      return "Analytics Digest";
    case "payment_digest":
      return "Payment Digest";
    case "general_recurring_task":
      return "General Task";
    default:
      return "Task";
  }
}

export function formatCadenceLabel(args: {
  cadence?: DraftCadence | "manual" | "custom";
  timeOfDay?: string;
  cronHuman?: string;
}) {
  if (args.cronHuman) {
    return args.cronHuman;
  }

  const cadence = args.cadence ?? "manual";
  if (cadence === "manual") {
    return "Runs manually";
  }

  if (cadence === "hourly") {
    return "Runs hourly";
  }

  const time = args.timeOfDay ?? "09:00";
  const [rawHour, rawMinute] = time.split(":");
  const hour = Number(rawHour);
  const minute = Number(rawMinute ?? "0");
  const period = hour >= 12 ? "PM" : "AM";
  const normalizedHour = hour % 12 === 0 ? 12 : hour % 12;
  const timeLabel = `${normalizedHour}:${String(minute).padStart(2, "0")} ${period}`;

  if (cadence === "weekly") {
    return `Runs weekly at ${timeLabel}`;
  }

  return `Runs daily at ${timeLabel}`;
}

function cronDayList(daysOfWeek: number[]) {
  if (daysOfWeek.length === 0) {
    return String(new Date().getDay());
  }

  return [...new Set(daysOfWeek)].sort((left, right) => left - right).join(",");
}

function timeLabelFromValue(time: string) {
  const [rawHour, rawMinute] = time.split(":");
  const hour = Number(rawHour);
  const minute = Number(rawMinute ?? "0");
  const period = hour >= 12 ? "PM" : "AM";
  const normalizedHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${normalizedHour}:${String(minute).padStart(2, "0")} ${period}`;
}

export function cronFromDraft(args: {
  cadence: DraftCadence;
  timeOfDay: string;
  daysOfWeek: number[];
}) {
  if (args.cadence === "hourly") {
    return "0 * * * *";
  }

  const [rawHour, rawMinute] = args.timeOfDay.split(":");
  const hour = Number(rawHour);
  const minute = Number(rawMinute ?? "0");
  const safeHour = Number.isFinite(hour) ? Math.max(0, Math.min(23, hour)) : 9;
  const safeMinute = Number.isFinite(minute) ? Math.max(0, Math.min(59, minute)) : 0;

  if (args.cadence === "weekly") {
    return `${safeMinute} ${safeHour} * * ${cronDayList(args.daysOfWeek)}`;
  }

  return `${safeMinute} ${safeHour} * * *`;
}

export function cronHumanFromDraft(args: {
  cadence: DraftCadence;
  timeOfDay: string;
  daysOfWeek: number[];
}) {
  if (args.cadence === "hourly") {
    return "At minute 0, every hour";
  }

  const timeLabel = timeLabelFromValue(args.timeOfDay);

  if (args.cadence === "weekly") {
    if (args.daysOfWeek.length > 0) {
      const dayNames = [...new Set(args.daysOfWeek)]
        .sort((left, right) => left - right)
        .map((day) =>
          ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][day],
          )
        .join(", ");
      return `At ${timeLabel}, every ${dayNames}`;
    }

    return `At ${timeLabel}, every week`;
  }

  return `At ${timeLabel}, every day`;
}

export function withDraftScheduleMetadata<
  T extends {
    cadence: DraftCadence;
    timeOfDay: string;
    daysOfWeek: number[];
  },
>(draft: T): T & Pick<AutonomousTaskDraft, "cron" | "cronHuman"> {
  return {
    ...draft,
    cron: cronFromDraft({
      cadence: draft.cadence,
      timeOfDay: draft.timeOfDay,
      daysOfWeek: draft.daysOfWeek,
    }),
    cronHuman: cronHumanFromDraft({
      cadence: draft.cadence,
      timeOfDay: draft.timeOfDay,
      daysOfWeek: draft.daysOfWeek,
    }),
  };
}

export function buildAutonomyDraft(
  prompt: string,
  toolkits: ToolkitConnection[],
  timezone: string,
): AutonomousTaskDraft {
  const cadence = inferCadence(prompt);
  const timeOfDay = inferTimeOfDay(prompt);
  const integrations = inferIntegrations(prompt, toolkits);
  const connected = new Set(
    toolkits.filter((toolkit) => toolkit.isConnected).map((toolkit) => toolkit.slug),
  );
  const missingIntegrationSlugs = integrations.filter((slug) => !connected.has(slug));
  const weekdays = cadence === "weekly" ? inferWeekdays(prompt) : [];
  const workflowType = workflowTypeFromPrompt(prompt, integrations);

  return withDraftScheduleMetadata({
    title: titleFromPrompt(prompt),
    description: descriptionFromWorkflowType(workflowType),
    instruction: prompt.trim(),
    cadence,
    timeOfDay,
    timezone,
    daysOfWeek: weekdays,
    integrationSlugs: integrations,
    deliveryChannels: ["in_app", "email"],
    goals: ["Deliver the update automatically on schedule."],
    successCriteria: ["The update is sent on time with the latest relevant information."],
    workflowType,
    sourcePrompt: prompt.trim(),
    missingIntegrationSlugs,
    recipeMetadata: undefined,
  });
}
