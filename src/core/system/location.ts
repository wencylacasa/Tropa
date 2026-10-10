import * as Location from 'expo-location';

export interface LocationCache {
  /** Starts tracking the location in the background if permitted. */
  start(): Promise<void>;
  /** Stops tracking the location. */
  stop(): void;
  /** Returns the last known location, or null if unavailable. */
  getLastKnownLocation(): { latitude: number; longitude: number } | null;
}

export class ExpoLocationCache implements LocationCache {
  private subscription: Location.LocationSubscription | null = null;
  private lastLocation: { latitude: number; longitude: number } | null = null;

  async start(): Promise<void> {
    if (this.subscription) return;

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      this.subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 60000,
          distanceInterval: 100,
        },
        (location) => {
          this.lastLocation = {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          };
        }
      );
    } catch {
      // Ignored: location tracking failed to start.
    }
  }

  stop(): void {
    if (this.subscription) {
      this.subscription.remove();
      this.subscription = null;
    }
  }

  getLastKnownLocation(): { latitude: number; longitude: number } | null {
    return this.lastLocation;
  }
}

/**
 * One-shot place text for "where am I": cached fix (else last known position)
 * → reverse geocode → "Street, District, City". Falls back to coordinates when
 * the geocoder is unavailable, and to null when there is no fix at all.
 */
export function createLocationDescriber(
  cache: LocationCache,
): () => Promise<string | null> {
  return async () => {
    let coords = cache.getLastKnownLocation();
    if (!coords) {
      try {
        const pos = await Location.getLastKnownPositionAsync();
        coords = pos ? { latitude: pos.coords.latitude, longitude: pos.coords.longitude } : null;
      } catch {
        coords = null;
      }
    }
    if (!coords) return null;

    try {
      const [place] = await Location.reverseGeocodeAsync(coords);
      const parts = [
        place?.street ?? place?.name,
        place?.district ?? place?.subregion,
        place?.city ?? place?.region,
      ].filter((p): p is string => typeof p === 'string' && p.length > 0);
      const text = [...new Set(parts)].join(', ');
      if (text) return text;
    } catch {
      // Geocoder unavailable (no Play services / offline): coordinates it is.
    }
    return `${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}`;
  };
}
