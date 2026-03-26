import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, figma } from '../ui/theme';

/* ─── Shimmer box ──────────────────────────────────────────────────────────── */

export function SkeletonBlock({
  width,
  height,
  borderRadius = 8,
  style,
}: {
  width: number | `${number}%`;
  height: number;
  borderRadius?: number;
  style?: ViewStyle;
}) {
  const opacity = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.8, duration: 900, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.35, duration: 900, useNativeDriver: true }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: '#E0E0E0',
          opacity,
        },
        style,
      ]}
    />
  );
}

/* ─── Skeleton subscription row ────────────────────────────────────────────── */

function SkeletonRow() {
  const f = figma.subscriptions273;
  return (
    <View style={sk.row}>
      <SkeletonBlock width={f.logoSize} height={f.logoSize} borderRadius={f.logoSize / 2} />
      <View style={sk.rowText}>
        <SkeletonBlock width={110} height={14} borderRadius={6} />
        <SkeletonBlock width={80} height={12} borderRadius={6} style={{ marginTop: 6 }} />
      </View>
      <View style={sk.rowRight}>
        <SkeletonBlock width={60} height={14} borderRadius={6} />
        <SkeletonBlock width={40} height={12} borderRadius={6} style={{ marginTop: 6 }} />
      </View>
    </View>
  );
}

/* ─── Full-screen skeleton (used while app initializes) ────────────────────── */

export function SubscriptionsSkeleton() {
  const insets = useSafeAreaInsets();
  const f = figma.subscriptions273;

  return (
    <View style={[sk.container, { paddingTop: insets.top + 16 }]}>
      {/* Title */}
      <View style={sk.header}>
        <SkeletonBlock width={180} height={30} borderRadius={10} />
        <SkeletonBlock width={f.settingsButtonSize} height={f.settingsButtonSize} borderRadius={f.settingsButtonSize / 2} />
      </View>

      {/* Spending section */}
      <View style={sk.spending}>
        <SkeletonBlock width={140} height={16} borderRadius={6} />
        <SkeletonBlock width={200} height={48} borderRadius={12} style={{ marginTop: 18 }} />
        <SkeletonBlock width={120} height={14} borderRadius={6} style={{ marginTop: 14 }} />
      </View>

      {/* Pills */}
      <View style={sk.pills}>
        <SkeletonBlock width={70} height={36} borderRadius={30} />
        <SkeletonBlock width={120} height={36} borderRadius={30} />
      </View>

      {/* List card */}
      <View style={sk.listCard}>
        <SkeletonRow />
        <View style={sk.sep} />
        <SkeletonRow />
        <View style={sk.sep} />
        <SkeletonRow />
        <View style={sk.sep} />
        <SkeletonRow />
        <View style={sk.sep} />
        <SkeletonRow />
      </View>
    </View>
  );
}

/* ─── Inline skeleton rows (used inside SubscriptionsScreen) ───────────────── */

export function SubscriptionListSkeleton() {
  return (
    <View style={sk.listCard}>
      <SkeletonRow />
      <View style={sk.sep} />
      <SkeletonRow />
      <View style={sk.sep} />
      <SkeletonRow />
      <View style={sk.sep} />
      <SkeletonRow />
    </View>
  );
}

/* ─── Styles ───────────────────────────────────────────────────────────────── */

const f = figma.subscriptions273;

const sk = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: f.contentPaddingX,
    marginBottom: 8,
  },
  spending: {
    paddingHorizontal: f.contentPaddingX,
    marginTop: f.titleToSpendingGroupGap - f.spendingGroupPredecessorStack,
    marginBottom: f.spendingBlockMarginBottom,
  },
  pills: {
    flexDirection: 'row',
    gap: f.pillRowGap,
    paddingHorizontal: f.contentPaddingX,
    marginBottom: f.pillRowMarginBottom,
  },
  listCard: {
    marginHorizontal: f.cardInsetX,
    backgroundColor: colors.surface,
    borderRadius: f.listCardRadius,
    overflow: 'hidden',
    ...f.shadow,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: f.rowGap,
    paddingHorizontal: f.rowPaddingH,
    paddingVertical: f.rowPaddingV,
  },
  rowText: {
    flex: 1,
    justifyContent: 'center',
  },
  rowRight: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  sep: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: f.listDivider,
    marginHorizontal: f.rowPaddingH,
  },
});
