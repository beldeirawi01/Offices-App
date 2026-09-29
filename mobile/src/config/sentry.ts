import Constants from "expo-constants";
import * as Sentry from "@sentry/react-native";

export function initSentry() {
  const dsn = Constants.expoConfig?.extra?.sentryDsn as string | undefined;
  if (!dsn) return;
  Sentry.init({ dsn, tracesSampleRate: 0.1 });
}

export { Sentry };
