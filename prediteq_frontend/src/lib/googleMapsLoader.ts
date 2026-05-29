const GOOGLE_MAPS_SCRIPT_ID = "prediteq-google-maps-script";
const GOOGLE_MAPS_CALLBACK_NAME = "__prediteqGoogleMapsInit";

let pendingGoogleMapsPromise: Promise<any> | null = null;

function normalizeLanguage(lang: string) {
  if (lang === "en") return "en";
  return "fr";
}

export function getGoogleMapsApiKey() {
  return String(import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? "").trim();
}

export function hasGoogleMapsApiKey() {
  return getGoogleMapsApiKey().length > 0;
}

export function getGoogleMapsMapId() {
  return String(import.meta.env.VITE_GOOGLE_MAPS_MAP_ID ?? "").trim();
}

export function loadGoogleMapsApi(lang: string) {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Maps can only load in the browser."));
  }

  if ((window as any).google?.maps) {
    return Promise.resolve((window as any).google);
  }

  if (pendingGoogleMapsPromise) {
    return pendingGoogleMapsPromise;
  }

  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) {
    return Promise.reject(new Error("Google Maps API key is missing."));
  }

  pendingGoogleMapsPromise = new Promise((resolve, reject) => {
    const existingScript = document.getElementById(GOOGLE_MAPS_SCRIPT_ID) as HTMLScriptElement | null;

    const fail = (message: string) => {
      pendingGoogleMapsPromise = null;
      delete (window as any)[GOOGLE_MAPS_CALLBACK_NAME];
      existingScript?.remove();
      reject(new Error(message));
    };

    (window as any)[GOOGLE_MAPS_CALLBACK_NAME] = () => {
      const googleMaps = (window as any).google;
      if (!googleMaps?.maps) {
        fail("Google Maps loaded without the expected maps object.");
        return;
      }

      delete (window as any)[GOOGLE_MAPS_CALLBACK_NAME];
      resolve(googleMaps);
    };

    if (existingScript) {
      existingScript.addEventListener(
        "error",
        () => fail("Google Maps script failed to load."),
        { once: true },
      );
      return;
    }

    const script = document.createElement("script");
    const params = new URLSearchParams({
      key: apiKey,
      callback: GOOGLE_MAPS_CALLBACK_NAME,
      language: normalizeLanguage(lang),
      loading: "async",
      region: "TN",
      v: "weekly",
    });

    script.id = GOOGLE_MAPS_SCRIPT_ID;
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    script.onerror = () => {
      pendingGoogleMapsPromise = null;
      delete (window as any)[GOOGLE_MAPS_CALLBACK_NAME];
      script.remove();
      reject(new Error("Google Maps script failed to load."));
    };

    document.head.appendChild(script);
  });

  return pendingGoogleMapsPromise;
}
