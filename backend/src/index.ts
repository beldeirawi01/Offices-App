import "express-async-errors";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env";
import { errorHandler } from "./middleware/errorHandler";
import { authRouter } from "./routes/auth.routes";
import { clientsRouter } from "./routes/clients.routes";
import { jobsRouter } from "./routes/jobs.routes";
import { voiceRouter } from "./routes/voice.routes";
import { invoicesRouter } from "./routes/invoices.routes";
import { paymentsRouter } from "./routes/payments.routes";
import { reportsRouter } from "./routes/reports.routes";
import { usersRouter } from "./routes/users.routes";

const app = express();

app.use(helmet());
app.use(cors());
app.use(morgan(env.nodeEnv === "development" ? "dev" : "combined"));

// Stripe webhook needs the raw body for signature verification, so it's
// mounted before the JSON body parser.
app.use("/api/payments", express.raw({ type: "application/json" }), paymentsRouter);

app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.use("/api/auth", authRouter);
app.use("/api/clients", clientsRouter);
app.use("/api/jobs", jobsRouter);
app.use("/api", voiceRouter);
app.use("/api/invoices", invoicesRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/users", usersRouter);

app.use(errorHandler);

app.listen(env.port, () => {
  console.log(`Offices App backend listening on port ${env.port}`);
});
