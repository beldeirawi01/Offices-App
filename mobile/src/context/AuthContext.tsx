import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { api } from "../api/client";

interface User {
  id: string;
  name: string;
  email: string;
  role: "OWNER" | "TECH";
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem("user")
      .then((raw) => {
        if (raw) {
          try {
            setUser(JSON.parse(raw));
          } catch {
            // Corrupted/stale stored value (e.g. from an old app version) —
            // fall back to logged-out rather than getting stuck here forever.
            AsyncStorage.multiRemove(["token", "user"]).catch(() => {});
          }
        }
      })
      .catch(() => {
        // AsyncStorage itself failed to read — treat as logged-out instead of
        // leaving the whole app stuck on its startup spinner indefinitely.
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const { data } = await api.post("/auth/login", { email, password });
    await AsyncStorage.setItem("token", data.token);
    await AsyncStorage.setItem("user", JSON.stringify(data.user));
    setUser(data.user);
  };

  const logout = async () => {
    await AsyncStorage.multiRemove(["token", "user"]);
    setUser(null);
  };

  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
