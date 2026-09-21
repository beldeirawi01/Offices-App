import { initSentry } from "./config/sentry";
initSentry();

import { app } from "./app";
import { env } from "./config/env";
import { startScheduledJobs } from "./services/scheduler.service";

app.listen(env.port, () => {
  console.log(`Offices App backend listening on port ${env.port}`);
  startScheduledJobs();
});
