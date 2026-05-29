export type UiLang = "fr" | "en";

export function normalizeUiLang(value: string | null | undefined): UiLang {
  return value === "en" ? "en" : "fr";
}

export function getUiLang(): UiLang {
  if (typeof document !== "undefined") {
    const documentLang = document.documentElement.lang?.trim();
    if (documentLang) {
      return normalizeUiLang(documentLang.slice(0, 2).toLowerCase());
    }
  }

  if (typeof window !== "undefined") {
    try {
      return normalizeUiLang(window.localStorage.getItem("pl-lang"));
    } catch {
      return "fr";
    }
  }

  return "fr";
}

export function getUiLocale(lang: UiLang = getUiLang()) {
  return lang === "en" ? "en-US" : "fr-FR";
}

export function localize<T>(lang: UiLang, fr: T, en: T): T {
  return lang === "en" ? en : fr;
}
