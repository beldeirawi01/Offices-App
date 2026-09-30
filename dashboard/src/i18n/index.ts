import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import en from "./locales/en.json";
import es from "./locales/es.json";

// "load: languageOnly" reduces a browser locale like "en-US" (what Playwright
// and most real browsers report) down to "en" before matching resources —
// without it, an unrecognized "en-US" key would fall through to fallbackLng
// on every load instead of matching the "en" resources directly.
i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { en: { translation: en }, es: { translation: es } },
    fallbackLng: "en",
    supportedLngs: ["en", "es"],
    load: "languageOnly",
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: "jobscribe-language",
      caches: ["localStorage"],
    },
  });

export default i18n;
