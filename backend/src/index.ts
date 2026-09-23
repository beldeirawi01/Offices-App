import { initSentry } from "./config/sentry";
initSentry();

import { app } from "./app";
import { env } from "./config/env";
import { startScheduledJobs } from "./services/scheduler.service";

app.listen(env.port, () => {
  console.log(`Jobscribe backend listening on port ${env.port}`);
  startScheduledJobs();
});
