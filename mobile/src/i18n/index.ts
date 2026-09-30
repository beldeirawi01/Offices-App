import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import * as Localization from "expo-localization";
import AsyncStorage from "@react-native-async-storage/async-storage";
import en from "./locales/en.json";
import es from "./locales/es.json";

const LANGUAGE_STORAGE_KEY = "jobscribe-language";

function detectDeviceLanguage(): "en" | "es" {
  // Only English/Spanish are translated so far — any other device locale
  // (e.g. "fr", "pt-BR") falls back to English rather than showing an
  // untranslated key.
  const tag = Localization.getLocales()[0]?.languageCode;
  return tag === "es" ? "es" : "en";
}

/**
 * Reads a saved language preference (a tech may want to override the
 * device's own OS language — a shared/company phone might be set to English
 * regardless of who's using it) before falling back to the device's own
 * locale. Called once at app startup, before the first render.
 */
export async function initI18n(): Promise<void> {
  const saved = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY).catch(() => null);
  const language = saved === "en" || saved === "es" ? saved : detectDeviceLanguage();

  await i18n.use(initReactI18next).init({
    resources: { en: { translation: en }, es: { translation: es } },
    lng: language,
    fallbackLng: "en",
    interpolation: { escapeValue: false }, // React already escapes — no need for i18next to also do it
  });
}

export async function setLanguage(language: "en" | "es"): Promise<void> {
  await i18n.changeLanguage(language);
  await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, language).catch(() => {});
}

export default i18n;
