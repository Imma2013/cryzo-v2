import type { Doc } from "../convex/_generated/dataModel";

export type AutonomousRunStatus = Doc<"autonomousRuns">["status"];
export type AutonomousTaskStatus = Doc<"autonomousTasks">["status"];
export type AutonomousTriggerSource = Doc<"autonomousRuns">["triggerSource"];

export type RecentAutonomousRun = Doc<"autonomousRuns"> & {
  taskTitle: string;
  taskStatus: AutonomousTaskStatus;
};

export function formatRunTime(value?: string) {
  if (!value) {
    return "Waiting to run";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function getRunStatusTone(status: AutonomousRunStatus) {
  if (status === "succeeded") {
    return "bg-green-100 text-green-700";
  }

  if (status === "failed" || status === "cancelled") {
    return "bg-red-100 text-red-700";
  }

  if (status === "running") {
    return "bg-blue-100 text-blue-700";
  }

  if (status === "awaiting_approval") {
    return "bg-amber-100 text-amber-700";
  }

  return "bg-neutral-100 text-neutral-600";
}
