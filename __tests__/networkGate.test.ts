const mockGetNetworkStateAsync = jest.fn();

jest.mock('expo-network', () => ({
  NetworkStateType: { WIFI: 'WIFI', ETHERNET: 'ETHERNET', CELLULAR: 'CELLULAR', NONE: 'NONE' },
  getNetworkStateAsync: () => mockGetNetworkStateAsync(),
}));

import { expoNetworkGate } from '@/core/models/networkGate';

describe('expoNetworkGate', () => {
  beforeEach(() => mockGetNetworkStateAsync.mockReset());

  it.each([
    [{ type: 'WIFI', isConnected: true }, true],
    [{ type: 'ETHERNET', isConnected: true }, true],
    [{ type: 'CELLULAR', isConnected: true }, false],
    [{ type: 'WIFI', isConnected: false }, false],
    [{ type: 'NONE', isConnected: false }, false],
    [{}, false],
  ])('%o -> %s', async (state, expected) => {
    mockGetNetworkStateAsync.mockResolvedValue(state);
    await expect(expoNetworkGate.isOnWifi()).resolves.toBe(expected);
  });

  it('treats an error as not on Wi-Fi', async () => {
    mockGetNetworkStateAsync.mockRejectedValue(new Error('boom'));
    await expect(expoNetworkGate.isOnWifi()).resolves.toBe(false);
  });
});
