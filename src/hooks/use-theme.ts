import { Colors } from '@/constants/theme';

/**
 * Tropa is always dark: it is used on a motorcycle, often in bright sun and at
 * night, and a light theme would only add glare. The system setting is ignored.
 */
export function useTheme() {
  return Colors.dark;
}
