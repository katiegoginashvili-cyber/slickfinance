import { Platform } from 'react-native';
import type { NativeStackNavigationOptions } from '@react-navigation/native-stack';
import { colors } from '../ui/theme';

function getIOSMajor(): number {
  if (Platform.OS !== 'ios') return 0;
  return parseInt(String(Platform.Version).split('.')[0], 10);
}

function isIOS26OrLater() {
  return Platform.OS === 'ios' && getIOSMajor() >= 26;
}

/**
 * Native iOS large title + transparent/blurred bar (see React Navigation native stack + iOS HIG).
 * Mirrors the Expo Router / native-stack setup from:
 * https://amanhimself.dev/blog/large-header-title-in-expo-router/
 */
export function getHomeNativeHeaderOptions(): NativeStackNavigationOptions {
  const ios = Platform.OS === 'ios';
  return {
    headerShown: true,
    title: 'Slick Money',
    headerLargeTitle: ios,
    headerTransparent: ios,
    headerBlurEffect: ios && !isIOS26OrLater() ? 'regular' : undefined,
    headerTintColor: colors.text,
    headerStyle: ios
      ? { backgroundColor: 'transparent' }
      : { backgroundColor: colors.bg },
    headerShadowVisible: !ios,
    headerTitleStyle: {
      fontWeight: '600',
      color: colors.text,
    },
    headerLargeTitleStyle: ios
      ? {
          fontFamily: 'BricolageGrotesque_800ExtraBold',
          color: colors.text,
        }
      : undefined,
  };
}
