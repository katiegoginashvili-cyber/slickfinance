import React, { useEffect, useState } from 'react';
import {
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { supabase } from '../lib/supabase';
import { colors } from '../ui/theme';

const APP_STORE_URL =
  'https://apps.apple.com/app/id<YOUR_APP_ID>';
const PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.aibudgetplanner.app';

function compareVersions(current: string, minimum: string): boolean {
  const cur = current.split('.').map(Number);
  const min = minimum.split('.').map(Number);
  for (let i = 0; i < Math.max(cur.length, min.length); i++) {
    const c = cur[i] ?? 0;
    const m = min[i] ?? 0;
    if (c < m) return true;
    if (c > m) return false;
  }
  return false;
}

type Props = { children: React.ReactNode };

export function ForceUpdateGate({ children }: Props) {
  const insets = useSafeAreaInsets();
  const [needsUpdate, setNeedsUpdate] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    async function check() {
      try {
        const key =
          Platform.OS === 'ios' ? 'min_ios_version' : 'min_android_version';

        const { data } = await supabase
          .from('app_config')
          .select('value')
          .eq('key', key)
          .single();

        if (data?.value) {
          const currentVersion =
            Constants.expoConfig?.version ?? Constants.manifest?.version ?? '0.0.0';
          if (compareVersions(currentVersion, data.value)) {
            setNeedsUpdate(true);
          }
        }
      } catch {
        // If config fetch fails, don't block the user
      } finally {
        setChecked(true);
      }
    }
    check();
  }, []);

  if (!checked) return null;

  if (!needsUpdate) return <>{children}</>;

  const storeUrl = Platform.OS === 'ios' ? APP_STORE_URL : PLAY_STORE_URL;

  return (
    <View style={[s.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={s.heroSection}>
        <View style={s.iconCircle}>
          <Ionicons name="arrow-up-circle-outline" size={48} color={colors.text} />
        </View>
        <Text style={s.title}>Update Required</Text>
        <Text style={s.subtitle}>
          A new version of Slick Money is available.{'\n'}
          Please update to continue.
        </Text>
      </View>

      <View style={s.buttonsSection}>
        <Pressable
          onPress={() => Linking.openURL(storeUrl)}
          style={({ pressed }) => [s.btn, s.updateBtn, pressed && s.pressed]}
        >
          <Ionicons
            name={Platform.OS === 'ios' ? 'logo-apple' : 'logo-google-playstore'}
            size={20}
            color="#FFFFFF"
          />
          <Text style={s.updateBtnText}>Update Now</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: 'space-between',
    paddingHorizontal: 32,
  },
  heroSection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  title: {
    fontFamily: 'BricolageGrotesque_800ExtraBold',
    fontSize: 36,
    letterSpacing: -1,
    color: colors.text,
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 17,
    fontWeight: '500',
    lineHeight: 24,
    color: colors.textMuted,
    textAlign: 'center',
  },
  buttonsSection: {
    paddingBottom: 24,
    gap: 12,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 54,
    borderRadius: 999,
  },
  pressed: { opacity: 0.8 },
  updateBtn: {
    backgroundColor: '#000000',
  },
  updateBtnText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
