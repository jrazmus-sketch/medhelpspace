import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "@/locales/admin/en.json";
import ptBR from "@/locales/admin/pt-BR.json";

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    lng: "pt-BR",
    fallbackLng: "en",
    resources: {
      "pt-BR": { translation: ptBR },
      en: { translation: en },
    },
    interpolation: { escapeValue: false },
  });
}

export default i18n;
