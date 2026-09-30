import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useEffect, useState } from "react";
import { ActivityIndicator, AppState, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import NetInfo from "@react-native-community/netinfo";
import { useTranslation } from "react-i18next";
import { AuthProvider, useAuth } from "./src/context/AuthContext";
import { processQueue } from "./src/services/uploadQueue";
import { RootStackParamList } from "./src/navigation/types";
import { colors } from "./src/theme";
import { initI18n } from "./src/i18n";
import LoginScreen from "./src/screens/LoginScreen";
import JobListScreen from "./src/screens/JobListScreen";
import NewJobScreen from "./src/screens/NewJobScreen";
import JobDetailScreen from "./src/screens/JobDetailScreen";
import DocumentationScreen from "./src/screens/DocumentationScreen";
import RecordScreen from "./src/screens/RecordScreen";
import QuoteReviewScreen from "./src/screens/QuoteReviewScreen";
import InvoiceReviewScreen from "./src/screens/InvoiceReviewScreen";
import { initSentry, Sentry } from "./src/config/sentry";

initSentry();

const Stack = createNativeStackNavigator<RootStackParamList>();

function RootNavigator() {
  const { user, loading } = useAuth();
  const { t } = useTranslation();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.paper }}>
        <ActivityIndicator size="large" color={colors.signal} />
      </View>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.ink },
        headerTintColor: colors.white,
        headerTitleStyle: { fontWeight: "700" },
        contentStyle: { backgroundColor: colors.paper },
      }}
    >
      <Stack.Screen name="JobList" component={JobListScreen} options={{ title: t("navigation.jobList") }} />
      <Stack.Screen name="NewJob" component={NewJobScreen} options={{ title: t("navigation.newJob") }} />
      <Stack.Screen name="JobDetail" component={JobDetailScreen} options={{ title: t("navigation.jobDetail") }} />
      <Stack.Screen name="Documentation" component={DocumentationScreen} options={{ title: t("navigation.documentation") }} />
      <Stack.Screen
        name="Record"
        component={RecordScreen}
        options={({ route }) => ({
          title: route.params.purpose === "QUOTE" ? t("navigation.recordQuote") : t("navigation.recordInvoiceNote"),
        })}
      />
      <Stack.Screen
        name="QuoteReview"
        component={QuoteReviewScreen}
        options={{ title: t("navigation.reviewQuote"), headerBackVisible: false }}
      />
      <Stack.Screen
        name="InvoiceReview"
        component={InvoiceReviewScreen}
        options={{ title: t("navigation.reviewInvoice"), headerBackVisible: false }}
      />
    </Stack.Navigator>
  );
}

function App() {
  const [i18nReady, setI18nReady] = useState(false);

  useEffect(() => {
    initI18n().finally(() => setI18nReady(true));
  }, []);

  useEffect(() => {
    // Catch up on anything queued while offline: on launch, whenever
    // connectivity comes back, and whenever the app returns to the
    // foreground (a tech often records in a dead zone, then drives to
    // where they have signal without ever force-quitting the app).
    processQueue();

    const unsubscribeNetInfo = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) {
        processQueue();
      }
    });
    const appStateSubscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") processQueue();
    });

    return () => {
      unsubscribeNetInfo();
      appStateSubscription.remove();
    };
  }, []);

  // i18next needs to finish loading the saved/detected language before any
  // screen renders — otherwise the first frame would briefly flash whatever
  // i18next's synchronous default is, regardless of the tech's actual
  // preference.
  if (!i18nReady) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.paper }}>
        <ActivityIndicator size="large" color={colors.signal} />
      </View>
    );
  }

  return (
    <AuthProvider>
      <NavigationContainer>
        <StatusBar style="light" />
        <RootNavigator />
      </NavigationContainer>
    </AuthProvider>
  );
}

// Sentry.wrap is a no-op wrapper when Sentry was never initialized (no DSN
// configured) — it also adds touch/navigation breadcrumbs and a root error
// boundary when it was.
export default Sentry.wrap(App);
