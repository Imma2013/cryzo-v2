import { v } from "convex/values";

export const taskStatusValidator = v.union(
  v.literal("active"),
  v.literal("paused"),
  v.literal("archived"),
);

export const autonomyModeValidator = v.union(
  v.literal("full_auto"),
  v.literal("approval_required"),
);

export const triggerTypeValidator = v.union(
  v.literal("schedule"),
  v.literal("event"),
  v.literal("hybrid"),
);

export const cadenceValidator = v.union(
  v.literal("manual"),
  v.literal("hourly"),
  v.literal("daily"),
  v.literal("weekly"),
  v.literal("custom"),
);

export const taskScheduleValidator = v.object({
  cadence: cadenceValidator,
  timezone: v.optional(v.string()),
  cron: v.optional(v.string()),
  cronHuman: v.optional(v.string()),
  timeOfDay: v.optional(v.string()),
  daysOfWeek: v.optional(v.array(v.number())),
  nextRunAt: v.optional(v.string()),
  lastRunAt: v.optional(v.string()),
});

export const deliveryChannelValidator = v.union(
  v.literal("in_app"),
  v.literal("email"),
);

export const runStatusValidator = v.union(
  v.literal("queued"),
  v.literal("running"),
  v.literal("awaiting_approval"),
  v.literal("succeeded"),
  v.literal("failed"),
  v.literal("cancelled"),
);

export const terminalRunStatusValidator = v.union(
  v.literal("succeeded"),
  v.literal("failed"),
  v.literal("cancelled"),
  v.literal("awaiting_approval"),
);

export const triggerSourceValidator = v.union(
  v.literal("manual"),
  v.literal("scheduler"),
  v.literal("event"),
  v.literal("retry"),
);

export const memoryScopeValidator = v.union(
  v.literal("user"),
  v.literal("workspace"),
  v.literal("task"),
);

export const memorySourceValidator = v.union(
  v.literal("user"),
  v.literal("agent"),
  v.literal("system"),
  v.literal("feedback"),
);

export const approvalStatusValidator = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("rejected"),
  v.literal("expired"),
);

export const resolvedApprovalStatusValidator = v.union(
  v.literal("approved"),
  v.literal("rejected"),
  v.literal("expired"),
);
