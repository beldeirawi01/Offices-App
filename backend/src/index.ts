import { initSentry } from "./config/sentry";
initSentry();

import { app } from "./app";
import { env, validateEnv } from "./config/env";
import { startScheduledJobs } from "./services/scheduler.service";

const envProblems = validateEnv();
if (envProblems.length > 0) {
  console.error("Refusing to start — invalid configuration:");
  envProblems.forEach((problem) => console.error(`  - ${problem}`));
  process.exit(1);
}

app.listen(env.port, () => {
  console.log(`Jobscribe backend listening on port ${env.port}`);
  startScheduledJobs();
});
