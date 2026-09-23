import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ActivityIndicator, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { AuthProvider, useAuth } from "./src/context/AuthContext";
import { RootStackParamList } from "./src/navigation/types";
import LoginScreen from "./src/screens/LoginScreen";
import JobListScreen from "./src/screens/JobListScreen";
import NewJobScreen from "./src/screens/NewJobScreen";
import RecordScreen from "./src/screens/RecordScreen";
import InvoiceReviewScreen from "./src/screens/InvoiceReviewScreen";

const Stack = createNativeStackNavigator<RootStackParamList>();

function RootNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  return (
    <Stack.Navigator>
      <Stack.Screen name="JobList" component={JobListScreen} options={{ title: "Jobscribe" }} />
      <Stack.Screen name="NewJob" component={NewJobScreen} options={{ title: "New job" }} />
      <Stack.Screen name="Record" component={RecordScreen} options={{ title: "Record job note" }} />
      <Stack.Screen
        name="InvoiceReview"
        component={InvoiceReviewScreen}
        options={{ title: "Review invoice", headerBackVisible: false }}
      />
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <NavigationContainer>
        <StatusBar style="auto" />
        <RootNavigator />
      </NavigationContainer>
    </AuthProvider>
  );
}
