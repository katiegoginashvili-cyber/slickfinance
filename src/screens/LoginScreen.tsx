import React, { useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../features/auth/store';
import { colors } from '../ui/theme';

WebBrowser.maybeCompleteAuthSession();

export function LoginScreen() {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);
  const setCurrentProvider = useAuthStore((s) => s.setCurrentProvider);

  async function signInWithApple() {
    try {
      setLoading(true);
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      if (!credential.identityToken) {
        throw new Error('No identity token received from Apple');
      }

      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
      });

      if (error) throw error;
      setCurrentProvider('apple');
    } catch (e: any) {
      if (e.code !== 'ERR_REQUEST_CANCELED') {
        Alert.alert('Sign In Error', e.message ?? 'Something went wrong');
      }
    } finally {
      setLoading(false);
    }
  }

  async function signInWithGoogle() {
    try {
      setLoading(true);

      const isExpoGo = Constants.appOwnership === 'expo';
      const redirectTo = isExpoGo
        ? makeRedirectUri({ path: 'auth/callback' })
        : 'slickfinance://auth/callback';

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          skipBrowserRedirect: true,
        },
      });

      if (error) throw error;
      if (!data.url) throw new Error('No auth URL returned');

      const result = await WebBrowser.openAuthSessionAsync(
        data.url,
        redirectTo,
      );

      if (result.type === 'success') {
        const { url } = result;
        const hashPart = url.split('#')[1];
        if (hashPart) {
          const params = new URLSearchParams(hashPart);
          const access_token = params.get('access_token');
          const refresh_token = params.get('refresh_token');

          if (access_token && refresh_token) {
            const { error: sessionError } = await supabase.auth.setSession({
              access_token,
              refresh_token,
            });
            if (sessionError) throw sessionError;
            setCurrentProvider('google');
          }
        }
      }
    } catch (e: any) {
      if (e.code !== 'ERR_REQUEST_CANCELED') {
        Alert.alert('Sign In Error', e.message ?? 'Something went wrong');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={[s.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {loading && (
        <View style={s.loadingOverlay}>
          <ActivityIndicator size="large" color={colors.text} />
        </View>
      )}

      <View style={s.heroSection}>
        <View style={s.iconCircle}>
          <Ionicons name="wallet-outline" size={48} color={colors.text} />
        </View>
        <Text style={s.title}>Slick Finance</Text>
        <Text style={s.subtitle}>
          Track your subscriptions{'\n'}and stay on top of spending
        </Text>
      </View>

      <View style={s.buttonsSection}>
        {Platform.OS === 'ios' && (
          <Pressable
            onPress={signInWithApple}
            disabled={loading}
            style={({ pressed }) => [s.btn, s.appleBtn, pressed && s.pressed]}
          >
            <Ionicons name="logo-apple" size={20} color="#FFFFFF" />
            <Text style={s.appleBtnText}>Continue with Apple</Text>
          </Pressable>
        )}

        <Pressable
          onPress={signInWithGoogle}
          disabled={loading}
          style={({ pressed }) => [s.btn, s.googleBtn, pressed && s.pressed]}
        >
          <Ionicons name="logo-google" size={18} color="#0B0803" />
          <Text style={s.googleBtnText}>Continue with Google</Text>
        </Pressable>

        <Text style={s.terms}>
          By continuing, you agree to our{'\n'}Terms of Service and Privacy Policy
        </Text>
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
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(245,245,245,0.7)',
    zIndex: 10,
    alignItems: 'center',
    justifyContent: 'center',
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
    fontFamily: 'SF Pro Display',
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
  appleBtn: {
    backgroundColor: '#000000',
  },
  appleBtnText: {
    fontFamily: 'SF Pro Display',
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  googleBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  googleBtnText: {
    fontFamily: 'SF Pro Display',
    fontSize: 17,
    fontWeight: '600',
    color: '#0B0803',
  },
  terms: {
    fontFamily: 'SF Pro Display',
    fontSize: 12,
    fontWeight: '400',
    color: colors.textSoft,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 18,
  },
});
