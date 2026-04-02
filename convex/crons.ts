import { cronJobs } from "convex/server";

// Scheduled recipe execution is driven by Vercel cron via /api/cron.
// Keep Convex cron registration empty so deploys do not reference removed jobs.
export default cronJobs();
