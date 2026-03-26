import React, { useMemo, useState } from 'react';
import {
  Dimensions,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppActionSheet } from '../components/AppActionSheet';
import { colors, figma, sheetTypography, spacing } from '../ui/theme';
import { IconCircleButton, PageHeader } from '../ui/components';
import { TabScreenBackground } from '../components/TabScreenBackground';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { RootTabsParamList } from '../../App';
import { navigateRoot } from '../navigation/navigateRoot';
import { USE_FIGMA_SINGLE_PAGE_NAV } from '../config/featureFlags';
import { CompanyLogo } from '../components/CompanyLogo';
import {
  useSubscriptionsStore,
  selectVisibleSubscriptions,
  type SubscriptionFilter,
  type SubscriptionSort,
} from '../features/subscriptions/store';
import { AnimatedMoneyAmount } from '../components/AnimatedMoneyAmount';
import { formatMoney, getMonthOverMonthSpendPill, monthlySpendTotal } from '../features/subscriptions/calc';
import type { Subscription } from '../features/subscriptions/types';
import {
  getDaysInMonth,
  getFirstWeekdayMondayZero,
  getRecurringDatesInMonth,
  MONTH_NAMES,
  WEEKDAY_LABELS_SHORT,
} from '../features/subscriptions/subscriptionCalendar';
import { billingSubtitle, cycleShort } from '../features/subscriptions/subscriptionRowFormatting';
import { useMonthlySpendCountFromOnFocus } from '../hooks/useMonthlySpendCountFromOnFocus';
import { hapticImpact, hapticSelection } from '../ui/haptics';

type Props = BottomTabScreenProps<RootTabsParamList, 'Subscriptions'>;

// ─── Design tokens ────────────────────────────────────────────────────────────
const BG = colors.bg;
const CARD = colors.surface;
const INK = colors.text;
const DIM = colors.textMuted;
const SEP = colors.borderSoft;
/** "Active" green from Figma TEXT 273:1689 (node 273:1518) */
const STATUS_ACTIVE = figma.subscriptions273.statusActive;
const GREEN_PILL_BG = '#E8F5E9';
const GREEN_PILL_TEXT = '#1B5E20';
const RED_PILL_BG = '#FFEBEE';
const RED_PILL_TEXT = '#C62828';
const NEUTRAL_PILL_BG = 'rgba(11,8,3,0.07)';
const NEUTRAL_PILL_TEXT = 'rgba(11,8,3,0.55)';
/** "Same vs …" — same red as increase chip text (#C62828), fill at 10% opacity */
const SAME_PILL_BG = 'rgba(198, 40, 40, 0.1)';

// ─── Screen ───────────────────────────────────────────────────────────────────
export function SubscriptionsScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const items     = useSubscriptionsStore((s) => s.items);
  const sort      = useSubscriptionsStore((s) => s.sort);
  const filter    = useSubscriptionsStore((s) => s.filter);
  const setSort   = useSubscriptionsStore((s) => s.setSort);
  const setFilter = useSubscriptionsStore((s) => s.setFilter);
  const hydrated  = useSubscriptionsStore((s) => s.hydrated);

  const [showCalendar, setShowCalendar] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const { width: windowWidth } = useWindowDimensions();
  const calendarSheetContentWidth = windowWidth - 2 * spacing.sheetPaddingX;
  const calendarSheetMaxHeight = Math.min(Math.round(Dimensions.get('window').height * 0.88), 700);
  const { countFrom: heroMonthlyCountFrom, onCountComplete: onHeroMonthlyCountComplete } =
    useMonthlySpendCountFromOnFocus();

  const [calMonth, setCalMonth] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const visible  = useMemo(() => selectVisibleSubscriptions({ items, sort, filter }), [items, sort, filter]);
  const currency = items[0]?.currency ?? 'USD';
  const monthly  = monthlySpendTotal(items);

  const now = new Date();
  const spendingMonthLabel = MONTH_NAMES[now.getMonth()];
  const yearlyProjection = monthly * 12;

  /** M2M uses full `items` (not `visible`) so it matches the portfolio summary and doesn’t vanish when filters change. */
  const momPill = useMemo(() => {
    if (!hydrated) return null;
    return getMonthOverMonthSpendPill(items);
  }, [hydrated, items]);

  function openDetail(id: string) {
    navigateRoot(navigation as any, 'SubscriptionDetail', { subscriptionId: id });
  }

  function openAdd() {
    navigateRoot(navigation as any, 'AddSubscription');
  }

  function openSettings() {
    navigateRoot(navigation as any, 'Settings');
  }

  const addBar = figma.subscriptions273.addTransactionBar;
  const bottomCta = figma.subscriptions273.bottomCta;
  const bottomOverlayPadBottom = Math.max(0, addBar.paddingBottomFromScreen - insets.bottom);
  /** Scroll padding so list clears the absolute bottom overlay (fade + button + bottom inset). */
  const scrollBottomForOverlay = useMemo(() => {
    const btnApprox =
      bottomCta.paddingVertical * 2 + Math.ceil(bottomCta.lineHeight);
    return (
      addBar.gradientFadeHeight +
      addBar.buttonRowTopPadding +
      btnApprox +
      bottomOverlayPadBottom +
      12
    );
  }, [addBar, bottomCta, bottomOverlayPadBottom]);

  return (
    <TabScreenBackground variant="figma" edges={['top', 'left', 'right', 'bottom']}>
      <View style={{ flex: 1 }}>
        <PageHeader
          title="Subscriptions"
          titleVariant="figma"
          right={
            USE_FIGMA_SINGLE_PAGE_NAV ? (
              <Pressable
                onPress={() => {
                  void hapticSelection();
                  openSettings();
                }}
                accessibilityRole="button"
                accessibilityLabel="Settings"
                style={({ pressed }) => [s.figmaSettingsBtn, pressed && s.pressed]}
              >
                <Ionicons name="settings-outline" size={20} color={INK} />
              </Pressable>
            ) : (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <IconCircleButton
                  icon="options-outline"
                  onPress={() => {
                    setShowCalendar(false);
                    setShowFilters(true);
                  }}
                />
                <IconCircleButton icon="add" onPress={openAdd} filled />
                <IconCircleButton icon="settings-outline" onPress={openSettings} />
              </View>
            )
          }
        />

        {hydrated && items.length === 0 ? (
          <View style={s.emptyStateWrap}>
            <View style={s.emptyStateCard}>
              <View style={s.emptyStateIconCircle}>
                <Ionicons name="receipt-outline" size={36} color={colors.textMuted} />
              </View>
              <Text style={s.emptyStateTitle}>No subscriptions yet</Text>
              <Text style={s.emptyStateSubtitle}>
                Track your recurring payments and{'\n'}stay on top of your spending
              </Text>
              <Pressable
                onPress={() => {
                  void hapticImpact();
                  openAdd();
                }}
                style={({ pressed }) => [s.emptyStateCta, pressed && s.pressed]}
              >
                <Ionicons name="add" size={20} color="#FFFFFF" />
                <Text style={s.emptyStateCtaText}>Add Your First Subscription</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <>
            <ScrollView
              style={{ flex: 1 }}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={[
                s.listContent,
                { paddingBottom: insets.bottom + scrollBottomForOverlay },
              ]}
            >
              <View style={s.figmaTextColumn}>
                <View style={s.spendingBlock}>
                  <Text style={s.spendingContext}>Spending in {spendingMonthLabel}</Text>
                  {hydrated ? (
                    <AnimatedMoneyAmount
                      amount={monthly}
                      currency={currency as any}
                      style={s.spendingHeroAmount}
                      countFrom={heroMonthlyCountFrom}
                      onCountComplete={onHeroMonthlyCountComplete}
                    />
                  ) : (
                    <Text style={s.spendingHeroAmount}>—</Text>
                  )}
                  <View style={s.spendingBottomRow}>
                    {momPill ? (
                      <View
                        style={[
                          s.momPill,
                          momPill.tone === 'green' && s.momPillGreen,
                          momPill.tone === 'red' && s.momPillRed,
                          momPill.tone === 'neutral' && s.momPillNeutral,
                        ]}
                        accessibilityRole="text"
                        accessibilityLabel={momPill.label}
                      >
                        <Text
                          style={[
                            s.momPillText,
                            momPill.tone === 'green' && s.momPillTextGreen,
                            momPill.tone === 'red' && s.momPillTextRed,
                            momPill.tone === 'neutral' && s.momPillTextNeutral,
                            momPill.tone === 'same' && s.momPillTextSame,
                            androidTextFix,
                          ]}
                        >
                          {momPill.label}
                        </Text>
                      </View>
                    ) : null}
                    <Text
                      style={[
                        s.spendingYearly,
                        momPill ? s.spendingYearlyInRow : null,
                        androidTextFix,
                      ]}
                    >
                      {hydrated ? `${formatMoney(yearlyProjection, currency as any)}/year` : ''}
                    </Text>
                  </View>
                </View>

                <View style={s.pillRow}>
                  <Pressable
                    onPress={() => {
                      void hapticSelection();
                      setShowCalendar(false);
                      setShowFilters(true);
                    }}
                    style={({ pressed }) => [s.pill, pressed && s.pressed]}
                  >
                    <Text style={s.pillText}>Filter</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      void hapticSelection();
                      setShowFilters(false);
                      setShowCalendar((open) => !open);
                    }}
                    style={({ pressed }) => [
                      s.pill,
                      showCalendar && s.pillSelected,
                      pressed && s.pressed,
                    ]}
                  >
                    <Text style={[s.pillText, showCalendar && s.pillTextSelected]}>Calendar View</Text>
                  </Pressable>
                </View>
              </View>

              <View style={s.listCard}>
                {visible.length === 0 ? (
                  <View style={{ paddingHorizontal: 16, paddingVertical: 28 }}>
                    <Text style={s.emptyText}>
                      {hydrated ? 'No subscriptions match this filter.' : 'Loading…'}
                    </Text>
                  </View>
                ) : (
                  visible.map((sub, idx) => (
                    <View key={sub.id}>
                      {idx !== 0 && <View style={s.sepFull} />}
                      <SubscriptionRow sub={sub} onPressItem={openDetail} />
                    </View>
                  ))
                )}
              </View>
            </ScrollView>

            <View
              pointerEvents="box-none"
              style={[
                s.bottomBarOverlay,
                {
                  paddingBottom: bottomOverlayPadBottom,
                  paddingTop: addBar.gradientFadeHeight + addBar.buttonRowTopPadding,
                  paddingHorizontal: addBar.paddingLeft,
                },
              ]}
            >
              <LinearGradient
                colors={['rgba(245,245,245,0)', colors.bg]}
                locations={[0, 1]}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />
              <Pressable
                onPress={() => {
                  void hapticImpact();
                  openAdd();
                }}
                style={({ pressed }) => [s.addTransactionBtn, pressed && s.pressed]}
              >
                <Ionicons name="add" size={20} color="#FFFFFF" />
                <Text style={s.addTransactionText}>Add Transaction</Text>
              </Pressable>
            </View>
          </>
        )}

        <AppActionSheet
          visible={showCalendar}
          onClose={() => setShowCalendar(false)}
          maxHeight={calendarSheetMaxHeight}
          safeAreaInsets={insets}
        >
          <View style={s.calendarSheetRoot}>
            <Text style={s.sheetTitle}>Calendar</Text>
            <ScrollView
              style={s.calendarSheetScroll}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <CalendarPanel
                items={items}
                currency={currency}
                calMonth={calMonth}
                setCalMonth={setCalMonth}
                contentWidth={calendarSheetContentWidth}
                onPressItem={(id) => {
                  setShowCalendar(false);
                  openDetail(id);
                }}
              />
            </ScrollView>
            <Pressable
              onPress={() => {
                void hapticSelection();
                setShowCalendar(false);
              }}
              style={({ pressed }) => [s.sheetDoneBtn, pressed && s.pressed]}
            >
              <Text style={s.sheetDoneText}>Done</Text>
            </Pressable>
          </View>
        </AppActionSheet>

        <AppActionSheet visible={showFilters} onClose={() => setShowFilters(false)} safeAreaInsets={insets}>
          <View style={s.sheetRoot}>
            <Text style={s.sheetTitle}>Filters</Text>

            <Text style={s.sheetSection}>Status</Text>
            <View style={s.sheetOptionsWrap}>
              {[
                { id: 'all', label: 'All' },
                { id: 'active', label: 'Active' },
                { id: 'trial', label: 'Trial' },
                { id: 'paused', label: 'Paused' },
                { id: 'cancelled', label: 'Cancelled' },
              ].map((opt) => (
                <Pressable
                  key={opt.id}
                  onPress={() => {
                    void hapticSelection();
                    setFilter(opt.id as SubscriptionFilter);
                  }}
                  style={({ pressed }) => [
                    s.sheetChip,
                    filter === opt.id && s.sheetChipActive,
                    pressed && s.pressed,
                  ]}
                >
                  <Text style={[s.sheetChipText, filter === opt.id && s.sheetChipTextActive]}>{opt.label}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={[s.sheetSection, { marginTop: 12 }]}>Sort</Text>
            <View style={s.sheetOptionsWrap}>
              {[
                { id: 'nearest_renewal', label: 'Nearest' },
                { id: 'highest_price', label: 'Highest' },
                { id: 'alpha', label: 'A-Z' },
                { id: 'recent', label: 'Recent' },
              ].map((opt) => (
                <Pressable
                  key={opt.id}
                  onPress={() => {
                    void hapticSelection();
                    setSort(opt.id as SubscriptionSort);
                  }}
                  style={({ pressed }) => [
                    s.sheetChip,
                    sort === opt.id && s.sheetChipActive,
                    pressed && s.pressed,
                  ]}
                >
                  <Text style={[s.sheetChipText, sort === opt.id && s.sheetChipTextActive]}>{opt.label}</Text>
                </Pressable>
              ))}
            </View>

            <View style={s.sheetSpacer} />

            <Pressable
              onPress={() => {
                void hapticSelection();
                setShowFilters(false);
              }}
              style={({ pressed }) => [s.sheetDoneBtn, pressed && s.pressed]}
            >
              <Text style={s.sheetDoneText}>Done</Text>
            </Pressable>
          </View>
        </AppActionSheet>
      </View>
    </TabScreenBackground>
  );
}

// ─── Calendar panel (main scroll or action sheet) ───────────────────────────────
function CalendarPanel({
  items, currency, calMonth, setCalMonth, onPressItem, contentWidth,
}: {
  items: Subscription[];
  currency: string;
  calMonth: { year: number; month: number };
  setCalMonth: (v: { year: number; month: number }) => void;
  onPressItem: (id: string) => void;
  /** When set (e.g. sheet inner width), grid columns match that width instead of the main list inset. */
  contentWidth?: number;
}) {
  const { width } = useWindowDimensions();
  const sideInset = figma.subscriptions273.cardInsetX * 2;
  const gridWidth = contentWidth ?? width - sideInset;
  const cellSize = Math.floor(gridWidth / 7);
  const { year, month } = calMonth;
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

  const renewalMap = useMemo(() => {
    const map: Record<number, Subscription[]> = {};
    for (const sub of items) {
      if (sub.status === 'cancelled') continue;
      const dates = getRecurringDatesInMonth(sub, year, month);
      for (const d of dates) {
        (map[d.getDate()] ??= []).push(sub);
      }
    }
    return map;
  }, [items, year, month]);

  const monthTotal = Object.values(renewalMap).flat().reduce((t, s) => t + s.price, 0);
  const upcomingTotal = Object.entries(renewalMap)
    .filter(([d]) => Number(d) >= (isCurrentMonth ? today.getDate() : 1))
    .flatMap(([, ss]) => ss)
    .reduce((t, s) => t + s.price, 0);

  function prev() {
    setCalMonth(month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 });
  }
  function next() {
    setCalMonth(month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 });
  }

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstWeekdayMondayZero(year, month);
  const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <View style={{ paddingBottom: 0 }}>
      {/* Month header */}
      <View style={s.calHeader}>
        <Pressable
          onPress={() => {
            void hapticSelection();
            prev();
          }}
          style={({ pressed }) => [s.calNavBtn, pressed && s.pressed]}
        >
          <Ionicons name="chevron-back" size={18} color={INK} />
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={s.calMonthTitle}>{MONTH_NAMES[month]} {year}</Text>
          <Text style={s.calTotals}>
            <Text style={s.calTotalBold}>{formatMoney(monthTotal, currency as any)} total</Text>
            <Text style={s.calTotalDim}>{'  ·  '}{formatMoney(upcomingTotal, currency as any)} upcoming</Text>
          </Text>
        </View>
        <Pressable
          onPress={() => {
            void hapticSelection();
            next();
          }}
          style={({ pressed }) => [s.calNavBtn, pressed && s.pressed]}
        >
          <Ionicons name="chevron-forward" size={18} color={INK} />
        </Pressable>
      </View>

      {/* Today button — scroll already applies cardInsetX */}
      <View style={{ alignItems: 'flex-end', paddingHorizontal: 0, marginBottom: 8 }}>
        <Pressable
          onPress={() => {
            void hapticSelection();
            setCalMonth({ year: today.getFullYear(), month: today.getMonth() });
          }}
          style={({ pressed }) => [s.todayBtn, pressed && s.pressed]}
        >
          <Text style={s.todayBtnText}>Today</Text>
        </Pressable>
      </View>

      {/* Day labels */}
      <View style={[s.calDayRow, { paddingHorizontal: 0 }]}>
        {WEEKDAY_LABELS_SHORT.map((d) => (
          <Text key={d} style={[s.calDayLabel, { width: cellSize }]}>{d}</Text>
        ))}
      </View>

      {/* Grid */}
      <View style={{ paddingHorizontal: 0 }}>
        {Array.from({ length: cells.length / 7 }, (_, row) => (
          <View key={row} style={s.calRow}>
            {cells.slice(row * 7, row * 7 + 7).map((day, col) => {
              const isToday = isCurrentMonth && day === today.getDate();
              const subs = day ? (renewalMap[day] ?? []) : [];
              return (
                <View key={col} style={[s.calCell, { width: cellSize, minHeight: cellSize + 8 }]}>
                  {day != null && (
                    <>
                      <View style={[s.calDayNumWrap, isToday && s.calDayNumToday]}>
                        <Text style={[s.calDayNum, isToday && s.calDayNumTextToday]}>{day}</Text>
                      </View>
                      {subs.length > 0 && (
                        <View style={s.calLogos}>
                          {subs.slice(0, 2).map((sub) => (
                            <Pressable
                              key={sub.id}
                              onPress={() => {
                                void hapticSelection();
                                onPressItem(sub.id);
                              }}
                              style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
                            >
                              {sub.domain ? (
                                <CompanyLogo domain={sub.domain} size={20} rounded={6} fallbackText={sub.serviceName} />
                              ) : (
                                <View style={s.calFallback}>
                                  <Text style={s.calFallbackText}>{(sub.serviceName[0] ?? '?').toUpperCase()}</Text>
                                </View>
                              )}
                            </Pressable>
                          ))}
                          {subs.length > 2 && (
                            <Text style={s.calMore}>+{subs.length - 2}</Text>
                          )}
                        </View>
                      )}
                    </>
                  )}
                </View>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Shared helpers ───────────────────────────────────────────────────────────
function SubscriptionRow({ sub, onPressItem }: { sub: Subscription; onPressItem: (id: string) => void }) {
  const statusLabel = sub.status.charAt(0).toUpperCase() + sub.status.slice(1);
  const statusColor =
    sub.status === 'active' ? STATUS_ACTIVE
      : sub.status === 'trial' ? '#6B3FBC'
        : sub.status === 'paused' ? '#B05E00'
          : DIM;

  return (
    <Pressable
      onPress={() => {
        void hapticSelection();
        onPressItem(sub.id);
      }}
      style={({ pressed }) => [s.subRow, pressed && s.pressed]}
    >
      <View style={s.logoCircle}>
        {sub.domain ? (
          <CompanyLogo domain={sub.domain} size={36} rounded={8} fallbackText={sub.serviceName} />
        ) : (
          <FallbackLogo name={sub.serviceName} />
        )}
      </View>
      <View style={s.rowLeftCol}>
        <Text style={s.rowName} numberOfLines={1}>{sub.serviceName}</Text>
        <Text style={s.rowBillingLine} numberOfLines={1}>{billingSubtitle(sub.nextChargeDate)}</Text>
      </View>
      <View style={s.rowRightCol}>
        <Text style={s.rowPriceRight}>
          {formatMoney(sub.price, sub.currency)} / {cycleShort(sub.billingCycle)}
        </Text>
        <Text style={[s.rowStatusText, { color: statusColor }]}>{statusLabel}</Text>
      </View>
    </Pressable>
  );
}

function FallbackLogo({ name }: { name: string }) {
  return (
    <View style={s.fallbackLogoInner}>
      <Text style={s.fallbackText}>{(name[0] ?? '?').toUpperCase()}</Text>
    </View>
  );
}

/** Android adds extra font padding; disabling matches Figma vertical metrics */
const androidTextFix =
  Platform.OS === 'android' ? ({ includeFontPadding: false } as const) : {};

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  pressed: { opacity: 0.75 },

  figmaSettingsBtn: {
    width: figma.subscriptions273.settingsButtonSize,
    height: figma.subscriptions273.settingsButtonSize,
    borderRadius: figma.subscriptions273.settingsButtonSize / 2,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: figma.border.default,
    alignItems: 'center',
    justifyContent: 'center',
    ...figma.subscriptions273.settingsShadow,
  },

  /** 16px card inset from screen; text column uses +20 inside `figmaTextColumn` → 36px */
  listContent: {
    paddingHorizontal: figma.subscriptions273.cardInsetX,
    paddingTop: 4,
  },
  figmaTextColumn: {
    paddingHorizontal: figma.subscriptions273.textColumnGutterX,
    alignSelf: 'stretch',
  },

  spendingBlock: {
    alignSelf: 'stretch',
    alignItems: 'flex-start',
    marginTop:
      figma.subscriptions273.titleToSpendingGroupGap -
      figma.subscriptions273.spendingGroupPredecessorStack,
    marginBottom: figma.subscriptions273.spendingBlockMarginBottom,
  },
  spendingContext: {
    ...figma.subscriptions273.spendingContext,
    marginBottom: figma.subscriptions273.spendingGroupRowGap,
    textAlign: 'left',
    alignSelf: 'stretch',
    ...androidTextFix,
  },
  spendingHeroAmount: {
    fontFamily: 'BricolageGrotesque_800ExtraBold',
    ...figma.heroNumber,
    marginBottom: figma.subscriptions273.spendingGroupHeroToAnnualGap,
    textAlign: 'left',
    alignSelf: 'stretch',
    ...androidTextFix,
  },
  spendingBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    width: '100%',
    gap: 12,
    flexWrap: 'wrap',
  },
  momPill: {
    flexDirection: 'row',
    minHeight: 32,
    paddingVertical: 6,
    paddingHorizontal: 8,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    borderRadius: 8,
    flexShrink: 1,
    maxWidth: '100%',
  },
  /** Same 14 / medium as yearly line */
  momPillText: {
    fontFamily: 'SF Pro Display',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '500',
  },
  momPillGreen: { backgroundColor: GREEN_PILL_BG },
  momPillTextGreen: { color: GREEN_PILL_TEXT },
  momPillRed: { backgroundColor: RED_PILL_BG },
  momPillTextRed: { color: RED_PILL_TEXT },
  momPillNeutral: { backgroundColor: NEUTRAL_PILL_BG },
  momPillTextNeutral: { color: NEUTRAL_PILL_TEXT },
  momPillSame: { backgroundColor: SAME_PILL_BG },
  momPillTextSame: { color: RED_PILL_TEXT },
  spendingYearly: {
    fontFamily: 'SF Pro Display',
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 18,
    color: '#616161',
    textAlign: 'left',
    alignSelf: 'stretch',
    ...androidTextFix,
  },
  spendingYearlyInRow: {
    alignSelf: 'auto',
    textAlign: 'left',
    flexShrink: 0,
  },

  pillRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    flexWrap: 'wrap',
    gap: figma.subscriptions273.pillRowGap,
    marginTop: 16,
    marginBottom: figma.subscriptions273.pillRowMarginBottom,
    alignSelf: 'stretch',
  },
  pill: {
    ...figma.subscriptions273.pill,
  },
  pillSelected: {
    backgroundColor: INK,
  },
  pillText: {
    ...figma.subscriptions273.pillLabel,
    ...androidTextFix,
  },
  pillTextSelected: {
    color: '#FFFFFF',
  },

  listCard: {
    backgroundColor: CARD,
    borderRadius: figma.subscriptions273.listCardRadius,
    overflow: 'hidden',
    ...figma.subscriptions273.shadow,
  },
  sepFull: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: figma.subscriptions273.listDivider,
    marginHorizontal: figma.subscriptions273.rowPaddingH,
  },

  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: figma.subscriptions273.rowGap,
    paddingHorizontal: figma.subscriptions273.rowPaddingH,
    paddingVertical: figma.subscriptions273.rowPaddingV,
  },
  logoCircle: {
    width: figma.subscriptions273.logoSize,
    height: figma.subscriptions273.logoSize,
    borderRadius: figma.subscriptions273.logoSize / 2,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: figma.border.default,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  rowLeftCol: {
    flex: 1,
    minWidth: 0,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  rowName: {
    ...figma.subscriptions273.rowTitle,
    textAlign: 'left',
    ...androidTextFix,
  },
  rowBillingLine: {
    ...figma.subscriptions273.rowBilling,
    textAlign: 'left',
    ...androidTextFix,
  },
  rowRightCol: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    minWidth: 88,
  },
  rowPriceRight: {
    ...figma.subscriptions273.rowPrice,
    textAlign: 'right',
    ...androidTextFix,
  },
  rowStatusText: {
    ...figma.subscriptions273.rowStatus,
    textAlign: 'right',
    ...androidTextFix,
  },
  fallbackLogoInner: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackText: { fontSize: 17, fontWeight: '800', color: INK },

  /** Absolute bottom stack: gradient + Add Transaction (see `bottomBarOverlay`) */
  bottomBarOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'flex-start',
  },
  addTransactionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    gap: figma.subscriptions273.bottomCta.iconLabelGap,
    backgroundColor: INK,
    borderRadius: figma.subscriptions273.bottomCta.borderRadius,
    paddingVertical: figma.subscriptions273.bottomCta.paddingVertical,
    paddingHorizontal: figma.subscriptions273.bottomCta.paddingHorizontal,
    maxWidth: '100%',
  },
  addTransactionText: {
    color: '#FFFFFF',
    fontSize: figma.subscriptions273.bottomCta.fontSize,
    fontWeight: figma.subscriptions273.bottomCta.fontWeight,
    lineHeight: figma.subscriptions273.bottomCta.lineHeight,
    letterSpacing: figma.subscriptions273.bottomCta.letterSpacing,
    ...androidTextFix,
  },
  emptyText: { textAlign: 'left', fontSize: 14, fontWeight: '500', color: DIM },

  emptyStateWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingBottom: 80,
  },
  emptyStateCard: {
    backgroundColor: CARD,
    borderRadius: 24,
    paddingVertical: 48,
    paddingHorizontal: 32,
    alignItems: 'center',
    alignSelf: 'stretch',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  emptyStateIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: BG,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  emptyStateTitle: {
    fontFamily: 'BricolageGrotesque_800ExtraBold',
    fontSize: 22,
    letterSpacing: -0.5,
    color: INK,
    marginBottom: 12,
    textAlign: 'center',
  },
  emptyStateSubtitle: {
    fontFamily: 'SF Pro Display',
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 22,
    color: DIM,
    textAlign: 'center',
    marginBottom: 32,
  },
  emptyStateCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: INK,
    borderRadius: 999,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignSelf: 'stretch',
  },
  emptyStateCtaText: {
    fontFamily: 'SF Pro Display',
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  sheetRoot: { flex: 1, minHeight: 0 },
  sheetTitle: { ...sheetTypography.title },
  sheetSection: {
    ...sheetTypography.section,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 0,
    marginBottom: 8,
  },
  sheetOptionsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sheetChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: BG,
  },
  sheetChipActive: { backgroundColor: INK },
  sheetChipText: { fontFamily: 'SF Pro Display', fontSize: 13, fontWeight: '600', color: DIM },
  sheetChipTextActive: { color: '#FFFFFF' },
  sheetSpacer: { flex: 1, minHeight: 12 },
  sheetDoneBtn: {
    backgroundColor: INK,
    borderRadius: 14,
    alignItems: 'center',
    paddingVertical: 12,
  },
  sheetDoneText: { ...sheetTypography.done },

  calendarSheetRoot: {
    flex: 1,
    minHeight: 0,
  },
  calendarSheetScroll: {
    flex: 1,
    minHeight: 0,
  },

  // Calendar
  calHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 0, paddingTop: 4, paddingBottom: 6,
  },
  calNavBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: CARD, alignItems: 'center', justifyContent: 'center',
  },
  calMonthTitle: { fontSize: 20, fontWeight: '800', color: INK },
  calTotals: { marginTop: 2, fontSize: 12 },
  calTotalBold: { fontWeight: '700', color: INK },
  calTotalDim: { fontWeight: '500', color: DIM },
  todayBtn: {
    paddingVertical: 6, paddingHorizontal: 12,
    borderRadius: 14, backgroundColor: CARD,
  },
  todayBtnText: { fontSize: 12, fontWeight: '700', color: INK },
  calDayRow: { flexDirection: 'row', marginBottom: 4 },
  calDayLabel: { textAlign: 'center', fontSize: 11, fontWeight: '700', color: DIM, paddingVertical: 4 },
  calRow: { flexDirection: 'row' },
  calCell: {
    alignItems: 'center', paddingTop: 6, paddingBottom: 4,
    borderTopWidth: 1, borderTopColor: SEP,
  },
  calDayNumWrap: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  calDayNumToday: { backgroundColor: INK },
  calDayNum: { fontSize: 12, fontWeight: '600', color: DIM },
  calDayNumTextToday: { color: '#fff', fontWeight: '800' },
  calLogos: { flexDirection: 'row', flexWrap: 'wrap', gap: 2, marginTop: 3, justifyContent: 'center' },
  calFallback: {
    width: 20, height: 20, borderRadius: 6,
    backgroundColor: BG, alignItems: 'center', justifyContent: 'center',
  },
  calFallbackText: { fontSize: 8, fontWeight: '800', color: INK },
  calMore: { fontSize: 8, fontWeight: '800', color: DIM, marginTop: 2 },
});
