import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "autonomous-dispatch-cycle",
  { minutes: 1 },
  internal.autonomousRuntime.dispatchScheduledRuns,
  {},
);

export default crons;
