import { Text } from "react-native";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { AuthProvider, useAuth } from "../src/context/AuthContext";
import LoginScreen from "../src/screens/LoginScreen";
import { api } from "../src/api/client";
import { initI18n } from "../src/i18n";

// LoginScreen renders translated strings via react-i18next — in the real app
// App.tsx initializes i18next once at startup before anything renders, but
// this test renders LoginScreen directly, so it has to do that setup itself.
beforeAll(() => initI18n());

// The real client wraps axios with interceptors that read expo-constants and
// secure storage — irrelevant to this flow and awkward to boot in Jest, so
// the whole module is replaced with just the one method AuthContext calls.
jest.mock("../src/api/client", () => ({ api: { post: jest.fn() } }));

// expo-secure-store has no Jest mock and no web fallback path in tests (that
// only kicks in for Platform.OS === "web"), so this stands in for the OS
// keychain with a plain in-memory map instead of mocking the native module.
// The factory runs once for the whole file, so the map is cleared between
// tests via __reset (below) rather than each test getting its own instance.
jest.mock("../src/services/secureStorage", () => {
  const store = new Map<string, string>();
  return {
    getSecureItem: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    setSecureItem: jest.fn((key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve();
    }),
    deleteSecureItems: jest.fn((keys: string[]) => {
      keys.forEach((k) => store.delete(k));
      return Promise.resolve();
    }),
    __reset: () => store.clear(),
  };
});

/**
 * Mirrors the loading/logged-out/logged-in branch in App.tsx's
 * RootNavigator, without pulling in real navigation, the upload queue, or
 * Sentry — this test is specifically about the auth handoff between
 * LoginScreen and AuthContext, which is the actual "basic mobile flow"
 * every other screen depends on.
 */
function AuthGate() {
  const { user, loading } = useAuth();
  if (loading) return <Text>loading</Text>;
  if (!user) return <LoginScreen />;
  return <Text>Logged in as {user.name}</Text>;
}

const mockedApi = api as unknown as { post: jest.Mock };
const secureStorage = jest.requireMock("../src/services/secureStorage") as { __reset: () => void };

describe("mobile login flow", () => {
  beforeEach(() => {
    mockedApi.post.mockReset();
    secureStorage.__reset();
  });

  it("logs in with correct credentials and shows the authenticated app", async () => {
    mockedApi.post.mockResolvedValueOnce({
      data: { token: "test-token", user: { id: "u1", name: "Pat Tech", email: "pat@example.com", role: "TECH" } },
    });

    const { getByText, getByPlaceholderText } = render(
      <AuthProvider>
        <AuthGate />
      </AuthProvider>,
    );

    await waitFor(() => getByPlaceholderText("Email"));

    fireEvent.changeText(getByPlaceholderText("Email"), "pat@example.com");
    fireEvent.changeText(getByPlaceholderText("Password"), "password123");
    fireEvent.press(getByText("Sign in"));

    await waitFor(() => getByText("Logged in as Pat Tech"));
    expect(mockedApi.post).toHaveBeenCalledWith("/auth/login", { email: "pat@example.com", password: "password123" });
  });

  it("shows an error on invalid credentials instead of silently failing", async () => {
    mockedApi.post.mockRejectedValueOnce({ response: { data: { error: "Invalid email or password" } } });

    const { getByText, getByPlaceholderText, queryByText } = render(
      <AuthProvider>
        <AuthGate />
      </AuthProvider>,
    );

    await waitFor(() => getByPlaceholderText("Email"));

    fireEvent.changeText(getByPlaceholderText("Email"), "nobody@example.com");
    fireEvent.changeText(getByPlaceholderText("Password"), "wrong-password");
    fireEvent.press(getByText("Sign in"));

    await waitFor(() => getByText("Invalid email or password"));
    expect(queryByText(/Logged in as/)).toBeNull();
  });

  it("switches the login screen to Spanish and back via the language toggle", async () => {
    const { getByText, getByPlaceholderText } = render(
      <AuthProvider>
        <AuthGate />
      </AuthProvider>,
    );
    await waitFor(() => getByPlaceholderText("Email"));

    fireEvent.press(getByText("Español"));
    await waitFor(() => getByPlaceholderText("Correo electrónico"));
    expect(getByText("Iniciar sesión")).toBeTruthy();

    fireEvent.press(getByText("English"));
    await waitFor(() => getByPlaceholderText("Email"));
    expect(getByText("Sign in")).toBeTruthy();
  });
});
