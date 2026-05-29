const GOOGLE_MAPS_SCRIPT_ID = "prediteq-google-maps-script";
const GOOGLE_MAPS_CALLBACK_NAME = "__prediteqGoogleMapsInit";

export interface GoogleMapsLatLngLiteral {
  lat: number;
  lng: number;
}

export interface GoogleMapsPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export type GoogleMapsBoundsLike = {
  readonly __googleMapsBoundsBrand?: "GoogleMapsBoundsLike";
};

export type GoogleMapsSizeLike = {
  readonly __googleMapsSizeBrand?: "GoogleMapsSizeLike";
};

export type GoogleMapsPointLike = {
  readonly __googleMapsPointBrand?: "GoogleMapsPointLike";
};

export interface GoogleMapsMapInstance {
  getZoom(): number | undefined;
  setZoom(zoom: number): void;
  setCenter(center: GoogleMapsLatLngLiteral): void;
  fitBounds(bounds: GoogleMapsBoundsLike, padding?: number | GoogleMapsPadding): void;
  setMapTypeId(mapTypeId: string): void;
}

export interface GoogleMapsInfoWindowInstance {
  setContent(content: string): void;
  open(options: {
    map: GoogleMapsMapInstance;
    anchor?: GoogleMapsMarkerInstance;
    shouldFocus?: boolean;
  }): void;
  close(): void;
}

export interface GoogleMapsMarkerInstance {
  addListener(eventName: string, handler: () => void): void;
  setMap(map: GoogleMapsMapInstance | null): void;
}

export interface GoogleMapsLatLngBoundsInstance extends GoogleMapsBoundsLike {
  extend(position: GoogleMapsLatLngLiteral): void;
}

export interface GoogleMapsMapOptions {
  center: GoogleMapsLatLngLiteral;
  zoom: number;
  minZoom: number;
  maxZoom: number;
  gestureHandling: string;
  scrollwheel: boolean;
  disableDefaultUI: boolean;
  zoomControl: boolean;
  mapTypeControl: boolean;
  streetViewControl: boolean;
  fullscreenControl: boolean;
  clickableIcons: boolean;
  keyboardShortcuts: boolean;
  backgroundColor: string;
  mapTypeId: string;
  zoomControlOptions: {
    position: number | string;
  };
  restriction: {
    latLngBounds: {
      north: number;
      south: number;
      east: number;
      west: number;
    };
    strictBounds: boolean;
  };
  isFractionalZoomEnabled: boolean;
  mapId?: string;
}

export interface GoogleMapsMarkerIcon {
  url: string;
  scaledSize: GoogleMapsSizeLike;
  anchor: GoogleMapsPointLike;
}

export interface GoogleMapsMarkerOptions {
  map: GoogleMapsMapInstance;
  position: GoogleMapsLatLngLiteral;
  title: string;
  icon: GoogleMapsMarkerIcon;
  optimized: boolean;
  zIndex?: number;
}

export interface GoogleMapsApi {
  Map: new (element: HTMLElement, options: GoogleMapsMapOptions) => GoogleMapsMapInstance;
  Marker: new (options: GoogleMapsMarkerOptions) => GoogleMapsMarkerInstance;
  InfoWindow: new (options: { maxWidth?: number }) => GoogleMapsInfoWindowInstance;
  LatLngBounds: new () => GoogleMapsLatLngBoundsInstance;
  Circle: new (options: { center: GoogleMapsLatLngLiteral; radius: number }) => { getBounds(): GoogleMapsBoundsLike | undefined };
  Size: new (width: number, height: number) => GoogleMapsSizeLike;
  Point: new (x: number, y: number) => GoogleMapsPointLike;
  MapTypeId: {
    HYBRID: string;
    ROADMAP: string;
  };
  ControlPosition: {
    LEFT_TOP: number | string;
  };
  event: {
    addListenerOnce(target: GoogleMapsMapInstance, eventName: string, handler: () => void): void;
  };
}

declare global {
  interface Window {
    google?: {
      maps?: GoogleMapsApi;
    };
    __prediteqGoogleMapsInit?: () => void;
  }
}

let pendingGoogleMapsPromise: Promise<GoogleMapsApi> | null = null;

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

function clearGoogleMapsCallback() {
  delete window.__prediteqGoogleMapsInit;
}

export function loadGoogleMapsApi(lang: string) {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Maps can only load in the browser."));
  }

  if (window.google?.maps) {
    return Promise.resolve(window.google.maps);
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
      clearGoogleMapsCallback();
      existingScript?.remove();
      reject(new Error(message));
    };

    window.__prediteqGoogleMapsInit = () => {
      const googleMaps = window.google?.maps;
      if (!googleMaps) {
        fail("Google Maps loaded without the expected maps object.");
        return;
      }

      clearGoogleMapsCallback();
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
      clearGoogleMapsCallback();
      script.remove();
      reject(new Error("Google Maps script failed to load."));
    };

    document.head.appendChild(script);
  });

  return pendingGoogleMapsPromise;
}
