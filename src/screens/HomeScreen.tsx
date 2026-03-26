import React, { useLayoutEffect } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CompanyLogo } from '../components/CompanyLogo';
import type { RootStackParamList } from '../../App';
import type { HomeStackParamList } from '../navigation/HomeStack';
import { TabScreenBackground } from '../components/TabScreenBackground';
import { IconCircleButton } from '../ui/components';
import { hapticSelection } from '../ui/haptics';
import { activeSubscriptionsCount, monthlySpendTotal, topSubscriptionsByPrice } from '../features/subscriptions/calc';
import { AnimatedMoneyAmount } from '../components/AnimatedMoneyAmount';
import { useSubscriptionsStore } from '../features/subscriptions/store';
import { colors, radius, spacing } from '../ui/theme';
import {
  ENABLE_BUDGET_TAB,
  SHOW_HOME_BUDGET_CARD,
  SHOW_HOME_HERO_TOTALS,
  USE_FIGMA_SINGLE_PAGE_NAV,
} from '../config/featureFlags';
import { navigateRoot } from '../navigation/navigateRoot';
import { useMonthlySpendCountFromOnFocus } from '../hooks/useMonthlySpendCountFromOnFocus';

/** Home is mounted either as root stack (Figma) or as `HomeMain` inside `HomeStack` (tabs). */
type Props =
  | NativeStackScreenProps<RootStackParamList, 'Home'>
  | NativeStackScreenProps<HomeStackParamList, 'HomeMain'>;

type BudgetRow = {
  id: string;
  name: string;
  spent: number;
  total: number;
  dotColor: string;
  fillColor: string;
};

const budgetRows: BudgetRow[] = [
  { id: 'g', name: 'Groceries', spent: 320, total: 500, dotColor: '#EFE4F8', fillColor: '#A646FA' },
  { id: 'd', name: 'Dining', spent: 210, total: 500, dotColor: '#F4ECE8', fillColor: '#DB7248' },
  { id: 's', name: 'Shopping', spent: 430, total: 400, dotColor: '#DFF0EA', fillColor: '#B1060F' },
];

export function HomeScreen({ navigation }: Props) {
  const heroTopPadding = 8;

  const subs = useSubscriptionsStore((s) => s.items);
  const currency = subs[0]?.currency ?? 'USD';
  const subsMonthly = monthlySpendTotal(subs);
  const subsCount = activeSubscriptionsCount(subs);
  const top3 = topSubscriptionsByPrice(subs, 3);

  const { countFrom: subsMonthlyCountFrom, onCountComplete: onSubsMonthlyCountComplete } =
    useMonthlySpendCountFromOnFocus();

  function openAddSubscription() {
    navigateRoot(navigation as any, 'AddSubscription');
  }

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          {USE_FIGMA_SINGLE_PAGE_NAV ? (
            <IconCircleButton
              icon="chevron-back"
              onPress={() => (navigation as any).navigate('Subscriptions')}
            />
          ) : null}
          <IconCircleButton icon="add" filled onPress={openAddSubscription} />
        </View>
      ),
    });
  }, [navigation]);

  return (
    <TabScreenBackground variant="figma" edges={['left', 'right', 'bottom']}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: 24 }]}
        showsVerticalScrollIndicator={false}
        {...(Platform.OS === 'ios' ? { contentInsetAdjustmentBehavior: 'automatic' as const } : {})}
      >
        <HeroSection
          topPadding={heroTopPadding}
          showTotals={SHOW_HOME_HERO_TOTALS}
          showEditBudget={ENABLE_BUDGET_TAB}
          onPressAdd={() => {}}
          onPressEditBudget={() => (navigation as any).navigate('Budget')}
        />

        {SHOW_HOME_BUDGET_CARD && ENABLE_BUDGET_TAB ? (
          <Pressable
            onPress={() => {
              void hapticSelection();
              (navigation as any).navigate('Budget');
            }}
            style={({ pressed }) => [styles.card, pressed && styles.pressed]}
          >
            <Text style={styles.cardTitle}>April Remaining Budget</Text>
            <View style={styles.amountRow}>
              <Text style={styles.cardAmount}>$420.00</Text>
              <Text style={styles.amountSub}>/ $1400.00</Text>
            </View>

            <View style={{ marginTop: 12 }}>
              {budgetRows.map((row) => (
                <BudgetProgressRow key={row.id} row={row} onPress={() => (navigation as any).navigate('Budget')} />
              ))}
            </View>
            <Text style={styles.cardFoot}>Running a little high</Text>
          </Pressable>
        ) : null}

        <Pressable
          onPress={() => {
            void hapticSelection();
            (navigation as any).navigate(subs.length === 0 ? 'AddSubscription' : 'Subscriptions');
          }}
          style={({ pressed }) => [styles.card, pressed && styles.pressed]}
        >
          {subs.length === 0 ? (
            <>
              <Text style={styles.cardTitle}>Subscriptions</Text>
              <View style={styles.emptyCardBody}>
                <Ionicons name="receipt-outline" size={28} color="rgba(11,8,3,0.3)" />
                <Text style={styles.emptyCardText}>
                  Tap to add your first subscription
                </Text>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.cardTitle}>Subscriptions</Text>
              <View style={styles.amountRow}>
                <AnimatedMoneyAmount
                  amount={subsMonthly}
                  currency={currency as any}
                  style={styles.cardAmount}
                  countFrom={subsMonthlyCountFrom}
                  onCountComplete={onSubsMonthlyCountComplete}
                />
                <Text style={styles.amountSub}>/ month</Text>
              </View>
              <Text style={styles.cardFoot}>{subsCount} active</Text>

              {top3.length > 0 ? (
                <View style={styles.logoStack} pointerEvents="none">
                  {top3.map((s, idx) => (
                    <LogoBubble key={s.id} overlap={idx !== 0}>
                      {s.domain ? (
                        <CompanyLogo domain={s.domain} size={30} rounded={8} fallbackText={s.serviceName} />
                      ) : (
                        <View style={styles.logoFallback}>
                          <Text style={styles.logoFallbackText}>{(s.serviceName.trim()[0] ?? '?').toUpperCase()}</Text>
                        </View>
                      )}
                    </LogoBubble>
                  ))}
                </View>
              ) : null}
            </>
          )}
        </Pressable>
      </ScrollView>
    </TabScreenBackground>
  );
}

function HeroSection({
  topPadding,
  showTotals,
  showEditBudget,
  onPressAdd,
  onPressEditBudget,
}: {
  topPadding: number;
  showTotals: boolean;
  showEditBudget: boolean;
  onPressAdd: () => void;
  onPressEditBudget: () => void;
}) {
  return (
    <View style={[styles.hero, { paddingTop: topPadding, minHeight: showTotals ? 274 : 100 }]}>
      {showTotals ? (
        <>
          <Text style={styles.label}>Available to Spend</Text>
          <Text style={styles.heroAmount}>$1,525.00</Text>
          <Text style={styles.delta}>+$320 vs last month</Text>
        </>
      ) : null}

      <View style={[styles.ctaRow, !showTotals && { marginTop: 8 }]}>
        <Pressable
          onPress={() => {
            void hapticSelection();
            onPressAdd();
          }}
          style={({ pressed }) => [styles.primaryCta, pressed && styles.pressed]}
        >
          <Text style={styles.primaryText}>Add Transaction</Text>
        </Pressable>
        {showEditBudget ? (
          <Pressable
            onPress={() => {
              void hapticSelection();
              onPressEditBudget();
            }}
            style={({ pressed }) => [styles.secondaryCta, pressed && styles.pressed]}
          >
            <Text style={styles.secondaryText}>Edit Budget</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function BudgetProgressRow({ row, onPress }: { row: BudgetRow; onPress: () => void }) {
  const ratio = Math.max(0, Math.min(1, row.spent / row.total));
  return (
    <Pressable
      onPress={() => {
        void hapticSelection();
        onPress();
      }}
      style={({ pressed }) => [styles.budgetRow, pressed && { opacity: 0.85 }]}
    >
      <View style={[styles.dot, { backgroundColor: row.dotColor }]} />
      <View style={{ flex: 1 }}>
        <View style={styles.budgetTop}>
          <Text style={styles.budgetName}>{row.name}</Text>
          <Text style={styles.budgetValue}>
            ${row.spent} <Text style={styles.budgetTotal}>/ {row.total}</Text>
          </Text>
        </View>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${ratio * 100}%`, backgroundColor: row.fillColor }]} />
        </View>
      </View>
    </Pressable>
  );
}

function LogoBubble({ children, overlap }: { children: React.ReactNode; overlap?: boolean }) {
  return <View style={[styles.logoBubble, overlap && { marginLeft: -14 }]}>{children}</View>;
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.screenX, paddingTop: 0 },
  pressed: { opacity: 0.84 },

  hero: { paddingHorizontal: 16, paddingBottom: 16, minHeight: 274 },
  label: { fontFamily: 'SF Pro Display', fontSize: 17, fontWeight: '600', color: '#000000', marginTop: 8 },
  heroAmount: { fontFamily: 'BricolageGrotesque_800ExtraBold', fontSize: 56, color: '#0B0803', marginTop: 10, lineHeight: 58 },
  delta: { fontFamily: 'SF Pro Display', fontSize: 14, fontWeight: '500', color: '#616161', marginTop: 6 },
  ctaRow: { marginTop: 34, flexDirection: 'row', gap: 8 },
  primaryCta: { width: 157, height: 48, borderRadius: 999, backgroundColor: '#30CE5A', alignItems: 'center', justifyContent: 'center' },
  secondaryCta: { width: 157, height: 48, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.65)', alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontFamily: 'SF Pro Display', fontSize: 17, fontWeight: '400', color: '#FFFFFF' },
  secondaryText: { fontFamily: 'SF Pro Display', fontSize: 17, fontWeight: '500', color: '#1A1A1A' },

  card: { backgroundColor: colors.surface, borderRadius: radius.card, paddingHorizontal: 18, paddingTop: 16, paddingBottom: 14, marginTop: 16 },
  cardTitle: { fontFamily: 'SF Pro Display', fontSize: 17, fontWeight: '600', color: '#000000' },
  amountRow: { marginTop: 8, flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  cardAmount: { fontFamily: 'BricolageGrotesque_800ExtraBold', fontSize: 32, lineHeight: 32, color: '#000000' },
  amountSub: { fontFamily: 'SF Pro Display', fontSize: 12, fontWeight: '500', color: '#616161' },
  cardFoot: { fontFamily: 'SF Pro Display', fontSize: 12, fontWeight: '500', color: '#616161', marginTop: 2 },

  budgetRow: { flexDirection: 'row', gap: 12, marginTop: 12, alignItems: 'center' },
  dot: { width: 48, height: 48, borderRadius: 24 },
  budgetTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  budgetName: { fontFamily: 'SF Pro Display', fontSize: 15, fontWeight: '600', color: '#171717' },
  budgetValue: { fontFamily: 'SF Pro Display', fontSize: 15, fontWeight: '600', color: '#171717' },
  budgetTotal: { fontFamily: 'SF Pro Display', fontWeight: '500', color: '#616161' },
  track: { marginTop: 10, height: 6, borderRadius: 20, backgroundColor: '#D9D9D9', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 20 },

  logoStack: { position: 'absolute', right: 20, top: 42, flexDirection: 'row', alignItems: 'center' },
  logoBubble: { width: 56, height: 56, borderRadius: 28, borderWidth: 1, borderColor: '#E8E8E8', backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  logoFallback: { width: 30, height: 30, borderRadius: 8, backgroundColor: 'rgba(11, 8, 3, 0.06)', alignItems: 'center', justifyContent: 'center' },
  logoFallbackText: { fontSize: 14, fontWeight: '900', color: 'rgba(11, 8, 3, 0.72)' },

  emptyCardBody: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16, marginBottom: 4 },
  emptyCardText: { fontFamily: 'SF Pro Display', fontSize: 15, fontWeight: '500', color: '#616161' },
});
