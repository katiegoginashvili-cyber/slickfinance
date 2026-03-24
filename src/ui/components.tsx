import React from 'react';
import { Platform, Pressable, StyleSheet, Text, TextStyle, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { hapticImpact, hapticSelection } from './haptics';
import { colors, figma, radius, spacing, typeScale } from './theme';

export function AppScreen({
  children,
  edges = ['top', 'left', 'right'],
}: {
  children: React.ReactNode;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
}) {
  return (
    <SafeAreaView style={s.screen} edges={edges}>
      {children}
    </SafeAreaView>
  );
}

export function PageHeader({
  title,
  subtitle,
  right,
  titleVariant = 'default',
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  /** `figma` — 30 / 800, letter-spacing -3% per Budgeting App Figma */
  titleVariant?: 'default' | 'figma';
}) {
  if (titleVariant === 'figma') {
    return (
      <View style={[s.pageHeader, s.pageHeaderFigma]}>
        <View style={s.pageHeaderTitleColumn}>
          {/* Wrapper avoids parent flex measuring Text too tight; overflow visible for ascenders */}
          <View style={s.pageTitleFigmaWrap}>
            <Text allowFontScaling={false} style={s.pageTitleFigma}>
              {title}
            </Text>
          </View>
          {subtitle ? <Text style={s.pageSubtitle}>{subtitle}</Text> : null}
        </View>
        {right ? <View style={s.pageHeaderRightFigma}>{right}</View> : null}
      </View>
    );
  }

  return (
    <View style={s.pageHeader}>
      <View style={{ flex: 1 }}>
        <Text style={s.pageTitle}>{title}</Text>
        {subtitle ? <Text style={s.pageSubtitle}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function ScreenHeader({
  title,
  left,
  right,
}: {
  title: string;
  left?: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <View style={s.screenHeader}>
      <View style={s.side}>{left}</View>
      <Text style={s.screenHeaderTitle} numberOfLines={1}>
        {title}
      </Text>
      <View style={[s.side, { alignItems: 'flex-end' }]}>{right}</View>
    </View>
  );
}

export function IconCircleButton({
  icon,
  onPress,
  filled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  filled?: boolean;
}) {
  return (
    <Pressable
      onPress={() => {
        void hapticSelection();
        onPress();
      }}
      style={({ pressed }) => [
        s.iconCircle,
        filled && s.iconCircleFilled,
        pressed && s.pressed,
      ]}
    >
      <Ionicons name={icon} size={18} color={filled ? '#fff' : colors.text} />
    </Pressable>
  );
}

export function AppButton({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={() => {
        if (disabled) return;
        void hapticImpact();
        onPress();
      }}
      disabled={disabled}
      style={({ pressed }) => [
        s.button,
        variant === 'secondary' && s.buttonSecondary,
        pressed && s.pressed,
        disabled && { opacity: 0.5 },
      ]}
    >
      <Text style={[s.buttonText, variant === 'secondary' && s.buttonTextSecondary]}>{label}</Text>
    </Pressable>
  );
}

export function SurfaceCard({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: any;
}) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <Text style={s.sectionLabel}>{children}</Text>;
}

export function HeaderTextAction({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={() => {
        void hapticSelection();
        onPress();
      }}
      style={({ pressed }) => [s.headerTextAction, pressed && s.pressed]}
    >
      <Text style={s.headerTextActionLabel}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  pressed: { opacity: 0.78 },
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: spacing.screenX,
    paddingTop: spacing.pageTop,
    paddingBottom: 12,
  },
  /**
   * iOS-style: row stays flush to safe top; only the title column gets 54px offset.
   * Trailing actions stay top-aligned (not pushed down with the title).
   */
  pageHeaderFigma: {
    paddingHorizontal: figma.subscriptions273.contentPaddingX,
    paddingTop: 0,
    alignItems: 'flex-start',
    overflow: 'visible',
  },
  pageHeaderTitleColumn: {
    flex: 1,
    paddingTop: figma.subscriptions273.titleColumnPaddingTop,
    overflow: 'visible',
  },
  /** Stays near the top of the safe area (not offset with the 54px title column) */
  pageHeaderRightFigma: {
    alignSelf: 'flex-start',
    paddingTop: spacing.pageTop,
  },
  pageTitle: typeScale.pageTitle,
  pageTitleFigmaWrap: {
    alignSelf: 'flex-start',
    overflow: 'visible',
  },
  /** No `fontStretch` — RN/web support is poor and it narrows glyphs; use natural font width. */
  pageTitleFigma: {
    ...figma.screenTitle,
    alignSelf: 'flex-start',
    paddingTop: 4,
    paddingBottom: 2,
    /** Android: default `includeFontPadding` keeps room above glyphs; `textAlignVertical` avoids vertical centering clipping */
    ...(Platform.OS === 'android'
      ? ({ textAlignVertical: 'top' } as TextStyle)
      : ({ transform: [{ translateY: 4 }] } as TextStyle)),
  },
  pageSubtitle: { marginTop: 2, fontSize: 14, fontWeight: '500', color: colors.textMuted },
  screenHeader: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.screenX,
    paddingVertical: 10,
  },
  side: {
    width: 72,
    justifyContent: 'center',
  },
  screenHeaderTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  headerTextAction: {
    minHeight: 36,
    justifyContent: 'center',
  },
  headerTextActionLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircleFilled: {
    backgroundColor: colors.primary,
  },
  button: {
    minHeight: 38,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonSecondary: {
    backgroundColor: colors.surface,
  },
  buttonText: {
    ...typeScale.button,
    color: '#fff',
  },
  buttonTextSecondary: {
    color: colors.text,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
  },
  sectionLabel: {
    ...typeScale.sectionLabel,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.sectionGap,
    marginBottom: 8,
  },
});

