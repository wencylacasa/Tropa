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
