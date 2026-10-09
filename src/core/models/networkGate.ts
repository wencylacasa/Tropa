import * as Network from 'expo-network';

import type { NetworkGate } from './download';

const UNMETERED = new Set<Network.NetworkStateType | undefined>([
  Network.NetworkStateType.WIFI,
  Network.NetworkStateType.ETHERNET,
]);

/** Wi-Fi (or Ethernet) check for the model downloader. Any failure counts as "not on Wi-Fi". */
export const expoNetworkGate: NetworkGate = {
  async isOnWifi() {
    try {
      const state = await Network.getNetworkStateAsync();
      return state.isConnected === true && UNMETERED.has(state.type);
    } catch {
      return false;
    }
  },
};
