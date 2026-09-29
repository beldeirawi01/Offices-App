import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";

// The auth token and stored user identity are sensitive enough to belong in
// the OS keychain/keystore, not plain-text AsyncStorage. expo-secure-store
// has no web implementation (there's no Keychain/Keystore in a browser), so
// this falls back to AsyncStorage there — `expo start --web` is a local dev
// convenience only, never the real distribution target (see README: mobile
// ships via EAS Build for iOS/Android).
const isWeb = Platform.OS === "web";

export function getSecureItem(key: string): Promise<string | null> {
  return isWeb ? AsyncStorage.getItem(key) : SecureStore.getItemAsync(key);
}

export function setSecureItem(key: string, value: string): Promise<void> {
  return isWeb ? AsyncStorage.setItem(key, value) : SecureStore.setItemAsync(key, value);
}

export async function deleteSecureItems(keys: string[]): Promise<void> {
  if (isWeb) {
    await AsyncStorage.multiRemove(keys);
  } else {
    await Promise.all(keys.map((key) => SecureStore.deleteItemAsync(key)));
  }
}
