import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { useFonts, BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { HomeScreen } from './src/screens/HomeScreen';
import { HomeStackNavigator } from './src/navigation/HomeStack';
import { getHomeNativeHeaderOptions } from './src/navigation/homeStackOptions';
import { BudgetScreen } from './src/screens/BudgetScreen';
import { SubscriptionsScreen } from './src/screens/SubscriptionsScreen';
import { InvestScreen } from './src/screens/InvestScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import {
  ENABLE_BUDGET_TAB,
  ENABLE_INVEST_TAB,
  USE_FIGMA_SINGLE_PAGE_NAV,
} from './src/config/featureFlags';
import { AddSubscriptionScreen } from './src/screens/AddSubscriptionScreen';
import { SubscriptionDetailScreen } from './src/screens/SubscriptionDetailScreen';
import { EditSubscriptionScreen } from './src/screens/EditSubscriptionScreen';
import { useNotificationSync } from './src/hooks/useNotificationSync';
import { prefetchTabBackground } from './src/assets/tabBackground';
import { getTabBarIconName } from './src/navigation/tabBarIcons';
import { useAuthStore } from './src/features/auth/store';
import { useSubscriptionsStore } from './src/features/subscriptions/store';

/**
 * Tab routes (Budget / Invest kept for types + future tabs; hidden from bar via featureFlags).
 */
export type RootTabsParamList = {
  Home: undefined;
  Budget: undefined;
  Subscriptions: undefined;
  Invest: undefined;
  Settings: undefined;
};

const Tabs = createBottomTabNavigator<RootTabsParamList>();
export type RootStackParamList = {
  /** Classic app shell (bottom tabs) */
  Tabs: undefined;
  /** Figma-style flat stack — same screens, no tab bar */
  Subscriptions: undefined;
  Home: undefined;
  Settings: undefined;
  Budget: undefined;
  Invest: undefined;
  AddSubscription: undefined;
  SubscriptionDetail: { subscriptionId: string };
  EditSubscription: { subscriptionId: string };
};
const Stack = createNativeStackNavigator<RootStackParamList>();

function AppInner() {
  const [fontsLoaded] = useFonts({ BricolageGrotesque_800ExtraBold });
  const session = useAuthStore((s) => s.session);
  const initialized = useAuthStore((s) => s.initialized);
  const initializeSubs = useSubscriptionsStore((s) => s.initialize);
  useNotificationSync();

  useEffect(() => {
    if (!session) return;
    const unsubscribe = initializeSubs();
    return unsubscribe;
  }, [session, initializeSubs]);

  if (!fontsLoaded || !initialized) return null;

  if (!session) {
    return (
      <>
        <StatusBar style="dark" />
        <LoginScreen />
      </>
    );
  }

  return (
    <>
      <StatusBar style="dark" />
      <Stack.Navigator
        initialRouteName={USE_FIGMA_SINGLE_PAGE_NAV ? 'Subscriptions' : 'Tabs'}
      >
        {USE_FIGMA_SINGLE_PAGE_NAV ? (
          <>
            <Stack.Screen name="Subscriptions" component={SubscriptionsScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Home" component={HomeScreen} options={getHomeNativeHeaderOptions()} />
            <Stack.Screen name="Settings" component={SettingsScreen} options={{ headerShown: false }} />
            {ENABLE_BUDGET_TAB ? (
              <Stack.Screen name="Budget" component={BudgetScreen} options={{ headerShown: false }} />
            ) : null}
            {ENABLE_INVEST_TAB ? (
              <Stack.Screen name="Invest" component={InvestScreen} options={{ headerShown: false }} />
            ) : null}
          </>
        ) : (
          <Stack.Screen name="Tabs" component={RootTabs} options={{ headerShown: false }} />
        )}
        <Stack.Screen
          name="AddSubscription"
          component={AddSubscriptionScreen}
          options={{
            /**
             * `formSheet` ties vertical scrolling to iOS sheet detents (“pushing up” instead of scrolling the list).
             * Full-screen modal behaves like a normal screen so the picker list ScrollView scrolls reliably.
             */
            presentation: Platform.OS === 'ios' ? 'fullScreenModal' : 'modal',
            headerShown: false,
            animation: 'slide_from_bottom',
            contentStyle: { flex: 1 },
          }}
        />
        <Stack.Screen
          name="SubscriptionDetail"
          component={SubscriptionDetailScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="EditSubscription"
          component={EditSubscriptionScreen}
          options={{
            presentation: Platform.OS === 'ios' ? 'fullScreenModal' : 'modal',
            headerShown: false,
            animation: 'slide_from_bottom',
            contentStyle: { flex: 1 },
          }}
        />
      </Stack.Navigator>
    </>
  );
}

export default function App() {
  const initializeAuth = useAuthStore((s) => s.initialize);

  useEffect(() => {
    prefetchTabBackground().catch(() => {});
  }, []);

  useEffect(() => {
    const unsubscribe = initializeAuth();
    return unsubscribe;
  }, [initializeAuth]);

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <AppInner />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

function RootTabs() {
  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarShowLabel: true,
        tabBarActiveTintColor: '#CB30E0',
        tabBarInactiveTintColor: '#8C8C8C',
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarStyle: styles.tabBar,
        tabBarItemStyle: styles.tabItem,
        tabBarIcon: ({ color, size, focused }) => (
          <Ionicons name={getTabBarIconName(route.name, focused)} size={size} color={color} />
        ),
      })}
    >
      <Tabs.Screen name="Home" component={HomeStackNavigator} />
      {ENABLE_BUDGET_TAB ? <Tabs.Screen name="Budget" component={BudgetScreen} /> : null}
      <Tabs.Screen name="Subscriptions" component={SubscriptionsScreen} />
      {ENABLE_INVEST_TAB ? <Tabs.Screen name="Invest" component={InvestScreen} /> : null}
      <Tabs.Screen name="Settings" component={SettingsScreen} />
    </Tabs.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E5E5',
    elevation: 0,
    shadowOpacity: 0,
  },
  tabItem: {
    paddingTop: 4,
    paddingBottom: 4,
  },
});
