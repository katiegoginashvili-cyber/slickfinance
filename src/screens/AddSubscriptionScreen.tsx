import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets, type EdgeInsets } from 'react-native-safe-area-context';
import { AppActionSheet } from '../components/AppActionSheet';
import { DatePickerModal } from '../components/DatePickerModal';
import { TimePickerModal } from '../components/TimePickerModal';
import { hapticImpactMedium, hapticSelection } from '../ui/haptics';
import { CompanyLogo } from '../components/CompanyLogo';
import { toLocalDateString } from '../features/subscriptions/buildBillingHistoryFromSubscription';
import { useSubscriptionsStore } from '../features/subscriptions/store';
import { requestNotificationPermissions } from '../features/notifications/service';
import { searchBrands, type BrandResult } from '../utils/brandSearch';
import { colors, radius, sheetTypography } from '../ui/theme';
import { AppButton, AppScreen, HeaderTextAction, IconCircleButton, ScreenHeader } from '../ui/components';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import type { Subscription } from '../features/subscriptions/types';
import {
  ADD_SUBSCRIPTION_CURRENCIES,
  BASE_CATEGORIES,
  BILLING_CYCLE_LABELS,
  BILLING_CYCLE_OPTIONS,
  CURRENCY_SYMBOLS,
  POPULAR_SERVICES_BY_SECTION,
  type ServiceTemplate,
} from '../features/subscriptions/addSubscriptionCatalog';

type Props = NativeStackScreenProps<RootStackParamList, 'AddSubscription'>;
type SheetType = null | 'list' | 'category' | 'currency' | 'billingCycle' | 'notify';

// ─── Design tokens (matches HomeScreen) ──────────────────────────────────────
const BG = colors.bg;
const CARD = colors.surface;
const INK = colors.text;
const DIM = colors.textMuted;
const SEP = colors.borderSoft;
const GREEN = colors.success;

export function AddSubscriptionScreen({ navigation }: Props) {
  const safeAreaInsets = useSafeAreaInsets();
  /** Same as Edit: fullScreenModal often reports 0 insets; Modal sheets need non-zero top/bottom. */
  const layoutInsets = useMemo<EdgeInsets>(
    () => ({
      top: safeAreaInsets.top > 0 ? safeAreaInsets.top : Platform.OS === 'ios' ? 59 : safeAreaInsets.top,
      bottom:
        safeAreaInsets.bottom > 0 ? safeAreaInsets.bottom : Platform.OS === 'ios' ? 34 : safeAreaInsets.bottom,
      left: safeAreaInsets.left,
      right: safeAreaInsets.right,
    }),
    [safeAreaInsets]
  );
  const add = useSubscriptionsStore((s) => s.add);
  const [saving, setSaving] = useState(false);

  const [step, setStep] = useState<'picker' | 'form'>('picker');
  const [search, setSearch] = useState('');
  const [apiResults, setApiResults] = useState<BrandResult[]>([]);
  const [apiLoading, setApiLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Form state
  const [serviceName, setServiceName] = useState('');
  const [domain, setDomain] = useState('');
  const [category, setCategory] = useState<string>('Other');
  const [categories, setCategories] = useState<string[]>(() => [...BASE_CATEGORIES]);
  const [categorySearch, setCategorySearch] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [sheet, setSheet] = useState<SheetType>(null);
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState<'USD' | 'EUR' | 'GEL'>('USD');
  const [billingCycle, setBillingCycle] = useState<Subscription['billingCycle']>('monthly');
  const [nextCharge, setNextCharge] = useState<Date>(() => {
    const d = new Date(); d.setDate(d.getDate() + 30); return d;
  });
  /** First charge date — drives generated billing history for MoM comparisons */
  const [subscriptionStartDate, setSubscriptionStartDate] = useState<Date>(() => {
    const d = new Date(); d.setDate(d.getDate() + 30); return d;
  });
  /** Once user edits "Subscription start", we stop auto-syncing it from "Payment date". */
  const subscriptionStartTouchedRef = useRef(false);
  const [isTrial, setIsTrial] = useState(false);
  const [list, setList] = useState('Personal');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [reminderDays, setReminderDays] = useState(1);
  const [reminderTime, setReminderTime] = useState('09:00');
  const [url, setUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showReminderTimePicker, setShowReminderTimePicker] = useState(false);

  // Debounced brand search — fires 350 ms after user stops typing
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = search.trim();
    if (!q) {
      setApiResults([]);
      setApiLoading(false);
      return;
    }
    setApiLoading(true);
    debounceRef.current = setTimeout(async () => {
      const results = await searchBrands(q);
      setApiResults(results);
      setApiLoading(false);
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search]);

  // Keep first charge in sync with next payment until the user explicitly sets "Subscription start"
  useEffect(() => {
    if (!subscriptionStartTouchedRef.current) {
      setSubscriptionStartDate(new Date(nextCharge.getTime()));
    }
  }, [nextCharge]);

  // Local filter of popular services (only when no API results)
  const filteredPopular = useMemo(() => {
    if (search.trim()) return [];
    return POPULAR_SERVICES_BY_SECTION;
  }, [search]);

  const filteredCategories = useMemo(() => {
    const q = categorySearch.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((c) => c.toLowerCase().includes(q));
  }, [categories, categorySearch]);

  function selectService(t: ServiceTemplate | BrandResult) {
    void hapticSelection();
    setServiceName(t.name);
    setDomain(t.domain);
    setCategory('category' in t ? t.category : 'Other');
    setStep('form');
  }

  function startCustom() {
    void hapticSelection();
    setServiceName(search.trim() ? search.trim() : '');
    setDomain('');
    setCategory('Other');
    setStep('form');
  }

  async function handleSave() {
    if (saving) return;
    const numPrice = Number(price.replace(',', '.'));
    if (!serviceName.trim() || !Number.isFinite(numPrice) || numPrice <= 0) {
      Alert.alert('Missing info', 'Enter a service name and a valid price.');
      return;
    }
    setSaving(true);
    void hapticImpactMedium();
    await add({
      serviceName: serviceName.trim(),
      domain: domain.trim() || undefined,
      category: (category as Subscription['category']) ?? 'Other',
      price: numPrice,
      currency,
      billingCycle,
      subscriptionStartDate: toLocalDateString(subscriptionStartDate),
      nextChargeDate: nextCharge.toISOString(),
      isTrial,
      list,
      paymentMethod: paymentMethod.trim() || undefined,
      reminderEnabled,
      reminderDaysBefore: reminderDays,
      reminderTime,
      url: url.trim() || undefined,
      description: notes.trim() || undefined,
      status: isTrial ? 'trial' : 'active',
    });
    navigation.goBack();
  }

  function addCategory() {
    const value = newCategory.trim();
    if (!value) return;
    if (!categories.includes(value)) {
      setCategories((prev) => [value, ...prev]);
    }
    setCategory(value);
    setNewCategory('');
    setSheet(null);
  }

  async function handleReminderToggle(value: boolean) {
    if (!value) {
      setReminderEnabled(false);
      return;
    }
    const granted = await requestNotificationPermissions();
    if (!granted) {
      Alert.alert(
        'Enable notifications',
        'Allow notifications to receive upcoming charge reminders.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ]
      );
      setReminderEnabled(false);
      return;
    }
    setReminderEnabled(true);
  }

  // ── Service Picker ────────────────────────────────────────────────────────
  if (step === 'picker') {
    const hasQuery = search.trim().length > 0;

    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: layoutInsets.top, paddingBottom: layoutInsets.bottom }}>
        <ScreenHeader
          title="Add Subscription"
          left={<HeaderTextAction label="Cancel" onPress={() => navigation.goBack()} />}
        />

        {/* Search bar — always at top */}
        <View style={s.searchTopWrap}>
          <View style={s.searchBar}>
            {apiLoading
              ? <ActivityIndicator size="small" color={DIM} style={{ marginRight: 8 }} />
              : <Ionicons name="search" size={16} color={DIM} style={{ marginRight: 8 }} />
            }
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search any brand or service…"
              placeholderTextColor={DIM}
              style={s.searchInput}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
            />
            {search.length > 0 && (
              <Pressable
                onPress={() => {
                  void hapticSelection();
                  setSearch('');
                }}
                hitSlop={8}
              >
                <Ionicons name="close-circle" size={16} color={DIM} />
              </Pressable>
            )}
          </View>
        </View>

        {/* flex:1 wrapper + ScrollView flex:1 so the list gets a bounded height and actually scrolls */}
        <View style={s.pickerScrollWrap}>
          <ScrollView
            style={s.pickerScroll}
            contentContainerStyle={s.pickerScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            keyboardDismissMode="on-drag"
          >
          {/* ── Brand Search results ─────────────────────────────────────── */}
          {hasQuery && (
            <>
              {apiLoading && apiResults.length === 0 ? (
                <View style={{ paddingTop: 48, alignItems: 'center' }}>
                  <ActivityIndicator size="large" color={DIM} />
                </View>
              ) : apiResults.length > 0 ? (
                <>
                  <Text style={s.sectionLabel}>Results</Text>
                  <View style={[s.card, { marginHorizontal: 16 }]}>
                    {apiResults.map((item, idx) => (
                      <View key={item.domain + idx}>
                        {idx !== 0 && <View style={[s.sep, { marginLeft: 62 }]} />}
                        <Pressable
                          onPress={() => selectService(item)}
                          style={({ pressed }) => [s.serviceRow, pressed && s.pressed]}
                        >
                          <CompanyLogo domain={item.domain} size={36} rounded={10} fallbackText={item.name} />
                          <View style={{ flex: 1 }}>
                            <Text style={s.serviceRowText}>{item.name}</Text>
                            <Text style={s.serviceRowDomain}>{item.domain}</Text>
                          </View>
                          <Ionicons name="chevron-forward" size={16} color="rgba(11,8,3,0.25)" />
                        </Pressable>
                      </View>
                    ))}
                  </View>
                </>
              ) : (
                <View style={{ alignItems: 'center', paddingTop: 40 }}>
                  <Text style={{ fontSize: 15, color: DIM, marginBottom: 4 }}>No results for "{search}"</Text>
                </View>
              )}

              {/* Always show "Add as custom" when user is searching */}
              <Text style={s.sectionLabel}>Custom</Text>
              <View style={[s.card, { marginHorizontal: 16 }]}>
                <PickerAction
                  icon="add-circle-outline"
                  label={`Add "${search.trim()}" manually`}
                  sublabel="Set your own logo, price, and details"
                  onPress={startCustom}
                />
              </View>
            </>
          )}

          {/* ── Default view: Quick actions + Popular list ───────────────── */}
          {!hasQuery && (
            <>
              <View style={[s.card, { marginTop: 16, marginHorizontal: 16 }]}>
                <PickerAction
                  icon="image-outline"
                  label="Import from photos"
                  sublabel="Receipt, bill or renewal screenshots"
                  locked
                />
                <View style={s.sep} />
                <PickerAction
                  icon="document-text-outline"
                  label="Import a file"
                  sublabel="Bank statement or spreadsheet (PDF or CSV)"
                  locked
                />
                <View style={s.sep} />
                <PickerAction
                  icon="add-circle-outline"
                  label="Custom subscription"
                  onPress={startCustom}
                />
              </View>

              {filteredPopular.map((group) => (
                <View key={group.section}>
                  <Text style={s.sectionLabel}>{group.section}</Text>
                  <View style={[s.card, { marginHorizontal: 16 }]}>
                    {group.items.map((item, idx) => (
                      <View key={item.name}>
                        {idx !== 0 && <View style={[s.sep, { marginLeft: 62 }]} />}
                        <Pressable
                          onPress={() => selectService(item)}
                          style={({ pressed }) => [s.serviceRow, pressed && s.pressed]}
                        >
                          <CompanyLogo domain={item.domain} size={36} rounded={10} fallbackText={item.name} />
                          <Text style={s.serviceRowText}>{item.name}</Text>
                          <Ionicons name="chevron-forward" size={16} color="rgba(11,8,3,0.25)" />
                        </Pressable>
                      </View>
                    ))}
                  </View>
                </View>
              ))}
            </>
          )}
          </ScrollView>
        </View>
      </View>
    );
  }

  // ── Form ──────────────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: layoutInsets.top, paddingBottom: layoutInsets.bottom }}>
      <ScreenHeader
        title="Add Subscription"
        left={<IconCircleButton icon="chevron-back" onPress={() => setStep('picker')} />}
        right={<AppButton label={saving ? 'Saving...' : 'Save'} onPress={handleSave} disabled={saving} />}
      />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          style={s.formScroll}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 50 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Hero preview */}
          <View style={[s.card, s.heroCard]}>
            <View style={s.heroTop}>
              {domain ? (
                <CompanyLogo domain={domain} size={52} rounded={16} fallbackText={serviceName || '?'} />
              ) : (
                <View style={s.heroFallback}>
                  <Text style={s.heroFallbackText}>{(serviceName[0] ?? '?').toUpperCase()}</Text>
                </View>
              )}
              <TextInput
                value={serviceName}
                onChangeText={setServiceName}
                placeholder="Service name"
                placeholderTextColor={DIM}
                style={s.heroName}
                autoCapitalize="words"
              />
            </View>
            <View style={s.priceRow}>
              <Pressable
                onPress={() => {
                  void hapticSelection();
                  setSheet('currency');
                }}
                style={s.currencyPill}
              >
                <Text style={s.currencyPillText}>{CURRENCY_SYMBOLS[currency]}</Text>
              </Pressable>
              <TextInput
                value={price}
                onChangeText={setPrice}
                placeholder="0.00"
                placeholderTextColor={DIM}
                keyboardType="decimal-pad"
                style={s.priceInput}
              />
            </View>
          </View>

          {/* Payment details — next payment first; subscription start follows (defaults match until user changes it) */}
          <View style={[s.card, { marginTop: 14 }]}>
            <FormRow label="Payment date">
              <Pressable
                onPress={() => {
                  void hapticSelection();
                  setShowDatePicker(true);
                }}
                style={({ pressed }) => [s.datePill, pressed && s.pressed]}
              >
                <Text style={s.datePillText}>
                  {nextCharge.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </Text>
              </Pressable>
            </FormRow>
            <Text style={s.startHint}>When your next charge is due.</Text>
            <View style={s.sep} />
            <FormRow
              label="Subscription start"
              onPress={() => {
                void hapticSelection();
                setShowStartDatePicker(true);
              }}
            >
              <Text style={s.valueText}>
                {subscriptionStartDate.toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </Text>
              <Ionicons name="chevron-forward" size={14} color={DIM} />
            </FormRow>
            <Text style={s.startHint}>
              First charge or member since — set earlier if you used this service long before installing the app. Matches payment date until you change it.
            </Text>
            <View style={s.sep} />
            <FormRow label="Billing Cycle" onPress={() => setSheet('billingCycle')}>
              <Text style={s.valueText}>{BILLING_CYCLE_LABELS[billingCycle]}</Text>
              <Ionicons name="chevron-forward" size={14} color={DIM} />
            </FormRow>
            <View style={s.sep} />
            <FormRow label="Free Trial">
              <Switch
                value={isTrial}
                onValueChange={setIsTrial}
                trackColor={{ false: '#E0E0E0', true: GREEN }}
                thumbColor="#fff"
              />
            </FormRow>
          </View>

          {/* List / Category / Payment */}
          <View style={[s.card, { marginTop: 10 }]}>
            <FormRow label="List" onPress={() => setSheet('list')}>
              <Text style={s.valueText}>{list}</Text>
              <Ionicons name="chevron-forward" size={14} color={DIM} />
            </FormRow>
            <View style={s.sep} />
            <FormRow label="Category" onPress={() => setSheet('category')}>
              <Text style={s.valueText}>{category}</Text>
              <Ionicons name="chevron-forward" size={14} color={DIM} />
            </FormRow>
            <View style={s.sep} />
            <FormRow label="Payment Method">
              <TextInput
                value={paymentMethod}
                onChangeText={setPaymentMethod}
                placeholder="None"
                placeholderTextColor={DIM}
                style={s.inlineInput}
                textAlign="right"
              />
              <Ionicons name="chevron-forward" size={14} color="rgba(11,8,3,0.2)" style={{ marginLeft: 2 }} />
            </FormRow>
          </View>

          {/* Notifications */}
          <View style={[s.card, { marginTop: 10 }]}>
            <FormRow label="Reminder">
              <Switch
                value={reminderEnabled}
                onValueChange={handleReminderToggle}
                trackColor={{ false: '#E0E0E0', true: GREEN }}
                thumbColor="#fff"
              />
            </FormRow>
            {reminderEnabled && (
              <>
                <View style={s.sep} />
                <FormRow label="Notify me" onPress={() => setSheet('notify')}>
                  <Text style={s.valueText}>
                    {reminderDays === 0
                      ? 'Same day'
                      : reminderDays === 7
                        ? '1 week before'
                        : `${reminderDays} day${reminderDays > 1 ? 's' : ''} before`}
                  </Text>
                  <Ionicons name="chevron-forward" size={14} color={DIM} />
                </FormRow>
                <View style={s.sep} />
                <FormRow label="Time">
                  <Pressable
                    onPress={() => {
                      void hapticSelection();
                      setShowReminderTimePicker(true);
                    }}
                    style={({ pressed }) => [s.pickerTap, pressed && s.pressed]}
                  >
                    <Text style={s.valueText}>{reminderTime}</Text>
                    <Ionicons name="chevron-forward" size={13} color={DIM} />
                  </Pressable>
                </FormRow>
              </>
            )}
          </View>

          {/* URL */}
          <Text style={s.fieldLabel}>WEBSITE / URL</Text>
          <View style={s.card}>
            <TextInput
              value={url}
              onChangeText={setUrl}
              placeholder="e.g. netflix.com"
              placeholderTextColor={DIM}
              style={s.textAreaInput}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {/* Notes */}
          <Text style={s.fieldLabel}>NOTES</Text>
          <View style={s.card}>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Add a note…"
              placeholderTextColor={DIM}
              style={[s.textAreaInput, { minHeight: 80, textAlignVertical: 'top' }]}
              multiline
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

        <AppActionSheet
          visible={sheet !== null}
          onClose={() => setSheet(null)}
          safeAreaInsets={layoutInsets}
        >
          {sheet === 'currency' && (
            <View style={s.sheetRoot}>
              <Text style={s.sheetTitle}>Currency</Text>
              <ScrollView style={s.sheetScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator>
                {ADD_SUBSCRIPTION_CURRENCIES.map((item) => (
                  <SheetOption
                    key={item}
                    label={`${item} (${CURRENCY_SYMBOLS[item]})`}
                    selected={currency === item}
                    onPress={() => {
                      setCurrency(item);
                      setSheet(null);
                    }}
                  />
                ))}
              </ScrollView>
            </View>
          )}

          {sheet === 'billingCycle' && (
            <View style={s.sheetRoot}>
              <Text style={s.sheetTitle}>Billing Cycle</Text>
              <ScrollView style={s.sheetScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator>
                {BILLING_CYCLE_OPTIONS.map((c) => (
                  <SheetOption
                    key={c}
                    label={BILLING_CYCLE_LABELS[c]}
                    selected={billingCycle === c}
                    onPress={() => {
                      setBillingCycle(c);
                      setSheet(null);
                    }}
                  />
                ))}
              </ScrollView>
            </View>
          )}

          {sheet === 'list' && (
            <View style={s.sheetRoot}>
              <Text style={s.sheetTitle}>Select List</Text>
              <ScrollView style={s.sheetScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator>
                {['Personal', 'Business'].map((item) => (
                  <SheetOption
                    key={item}
                    label={item}
                    selected={list === item}
                    onPress={() => {
                      setList(item);
                      setSheet(null);
                    }}
                  />
                ))}
              </ScrollView>
            </View>
          )}

          {sheet === 'category' && (
            <View style={s.sheetRoot}>
              <Text style={s.sheetTitle}>Category</Text>
              <TextInput
                value={categorySearch}
                onChangeText={setCategorySearch}
                placeholder="Search category"
                placeholderTextColor={DIM}
                style={s.sheetSearch}
              />
              <ScrollView style={s.sheetScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator>
                {filteredCategories.map((item) => (
                  <SheetOption
                    key={item}
                    label={item}
                    selected={category === item}
                    onPress={() => {
                      setCategory(item);
                      setSheet(null);
                    }}
                  />
                ))}
              </ScrollView>
              <View style={s.inlineEditor}>
                <Text style={s.inlineLabel}>Add new category</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TextInput
                    value={newCategory}
                    onChangeText={setNewCategory}
                    placeholder="New category"
                    placeholderTextColor={DIM}
                    style={[s.sheetTextInput, { flex: 1 }]}
                  />
                  <Pressable
                    onPress={() => {
                      void hapticSelection();
                      addCategory();
                    }}
                    style={s.smallActionBtn}
                  >
                    <Text style={s.smallActionText}>Add</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          )}

          {sheet === 'notify' && (
            <View style={s.sheetRoot}>
              <Text style={s.sheetTitle}>Notification Settings</Text>
              <ScrollView style={s.sheetScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator>
                {[
                  { days: 0, label: 'Same day' },
                  { days: 1, label: '1 day before' },
                  { days: 3, label: '3 days before' },
                  { days: 7, label: '1 week before' },
                  { days: -1, label: 'Custom' },
                ].map((item) => (
                  <SheetOption
                    key={item.label}
                    label={item.label}
                    selected={
                      item.days === -1 ? ![0, 1, 3, 7].includes(reminderDays) : reminderDays === item.days
                    }
                    onPress={() => {
                      if (item.days === -1) {
                        if ([0, 1, 3, 7].includes(reminderDays)) setReminderDays(2);
                      } else {
                        setReminderDays(item.days);
                      }
                    }}
                  />
                ))}
                {![0, 1, 3, 7].includes(reminderDays) && (
                  <View style={s.inlineEditor}>
                    <Text style={s.inlineLabel}>Custom days before</Text>
                    <TextInput
                      value={String(reminderDays)}
                      onChangeText={(t) => setReminderDays(Math.max(1, Number(t.replace(/\D/g, '') || 1)))}
                      keyboardType="number-pad"
                      style={s.sheetTextInput}
                    />
                  </View>
                )}
              </ScrollView>
              <Pressable
                onPress={() => {
                  void hapticSelection();
                  setSheet(null);
                }}
                style={s.sheetDoneBtn}
              >
                <Text style={s.sheetDoneText}>Confirm</Text>
              </Pressable>
            </View>
          )}
        </AppActionSheet>

        <DatePickerModal
          visible={showDatePicker}
          value={nextCharge}
          onClose={() => setShowDatePicker(false)}
          onSelect={(d) => setNextCharge(d)}
          title="Payment date"
        />
        <DatePickerModal
          visible={showStartDatePicker}
          value={subscriptionStartDate}
          onClose={() => setShowStartDatePicker(false)}
          onSelect={(d) => {
            subscriptionStartTouchedRef.current = true;
            setSubscriptionStartDate(d);
          }}
          title="Subscription start"
        />
        <TimePickerModal
          visible={showReminderTimePicker}
          value={reminderTime}
          onClose={() => setShowReminderTimePicker(false)}
          onSelect={(hhmm) => setReminderTime(hhmm)}
        />
    </View>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function PickerAction({
  icon,
  label,
  sublabel,
  locked,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  sublabel?: string;
  locked?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={locked ? undefined : onPress}
      style={({ pressed }) => [s.actionRow, !locked && pressed && s.pressed]}
    >
      <View style={s.actionIcon}>
        <Ionicons name={icon} size={20} color={INK} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.actionLabel}>{label}</Text>
        {sublabel ? <Text style={s.actionSublabel}>{sublabel}</Text> : null}
      </View>
      {locked
        ? <Ionicons name="lock-closed" size={14} color="rgba(11,8,3,0.2)" />
        : <Ionicons name="chevron-forward" size={16} color="rgba(11,8,3,0.25)" />
      }
    </Pressable>
  );
}

function FormRow({
  label,
  children,
  onPress,
}: {
  label: string;
  children: React.ReactNode;
  onPress?: () => void;
}) {
  if (!onPress) {
    return (
      <View style={s.formRow}>
        <Text style={s.formRowLabel}>{label}</Text>
        <View style={s.formRowRight}>{children}</View>
      </View>
    );
  }

  return (
    <Pressable
      onPress={() => {
        void hapticSelection();
        onPress();
      }}
      style={({ pressed }) => [s.formRow, pressed && s.pressed]}
    >
      <Text style={s.formRowLabel}>{label}</Text>
      <View style={s.formRowRight}>{children}</View>
    </Pressable>
  );
}

function SheetOption({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={() => {
        void hapticSelection();
        onPress();
      }}
      style={({ pressed }) => [s.sheetOption, pressed && s.pressed]}
    >
      <Text style={s.sheetOptionText}>{label}</Text>
      {selected ? (
        <Ionicons name="checkmark-circle" size={18} color={GREEN} />
      ) : (
        <Ionicons name="chevron-forward" size={14} color={DIM} />
      )}
    </Pressable>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  pressed: { opacity: 0.75 },

  sectionLabel: {
    fontSize: 12, fontWeight: '700', color: DIM,
    marginTop: 20, marginBottom: 8, marginHorizontal: 16,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  card: { backgroundColor: CARD, borderRadius: radius.card },
  sep: { height: 1, backgroundColor: SEP, marginHorizontal: 16 },

  // Picker — bounded scroll area (see screen structure above)
  pickerScrollWrap: { flex: 1 },
  pickerScroll: { flex: 1 },
  pickerScrollContent: { paddingBottom: 40 },
  /** Form step: same bounded-height scroll as picker */
  formScroll: { flex: 1 },

  actionRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  actionIcon: {
    width: 38, height: 38, borderRadius: 11,
    backgroundColor: BG, alignItems: 'center', justifyContent: 'center',
  },
  actionLabel: { fontSize: 15, fontWeight: '600', color: INK },
  actionSublabel: { fontSize: 12, color: DIM, marginTop: 2 },
  serviceRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12, gap: 14,
  },
  serviceRowText: { flex: 1, fontSize: 15, fontWeight: '500', color: INK },

  // Search bar — pinned at top below nav
  searchTopWrap: {
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6,
    backgroundColor: BG,
  },
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: CARD, borderRadius: 14,
    paddingHorizontal: 12, paddingVertical: 11,
  },
  searchInput: { flex: 1, fontSize: 15, color: INK },
  serviceRowDomain: { fontSize: 12, color: DIM, marginTop: 1 },

  // Hero card
  heroCard: { marginTop: 16, paddingHorizontal: 18, paddingVertical: 16, gap: 14 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  heroFallback: {
    width: 52, height: 52, borderRadius: 16,
    backgroundColor: BG, alignItems: 'center', justifyContent: 'center',
  },
  heroFallbackText: { fontSize: 22, fontWeight: '800', color: INK },
  heroName: { flex: 1, fontSize: 18, fontWeight: '700', color: INK },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  currencyPill: {
    width: 38, height: 38, borderRadius: 11,
    backgroundColor: BG, alignItems: 'center', justifyContent: 'center',
  },
  currencyPillText: { fontSize: 16, fontWeight: '700', color: INK },
  priceInput: { flex: 1, fontSize: 24, fontWeight: '700', color: INK },

  // Form rows
  formRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  formRowLabel: { flex: 1, fontSize: 15, fontWeight: '500', color: INK },
  formRowRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },

  datePill: {
    paddingVertical: 6, paddingHorizontal: 12,
    backgroundColor: BG, borderRadius: 10,
  },
  datePillText: { fontSize: 14, fontWeight: '600', color: INK },
  valueText: { fontSize: 14, fontWeight: '500', color: DIM },
  pickerTap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  inlineInput: { fontSize: 14, fontWeight: '500', color: DIM, minWidth: 80 },

  fieldLabel: {
    fontSize: 11, fontWeight: '700', color: DIM,
    marginTop: 20, marginBottom: 8,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  textAreaInput: { fontSize: 15, color: INK, paddingHorizontal: 16, paddingVertical: 14 },
  startHint: {
    fontSize: 12,
    fontWeight: '500',
    color: DIM,
    paddingHorizontal: 16,
    marginTop: 4,
    marginBottom: 4,
    lineHeight: 16,
  },

  sheetRoot: { flex: 1, minHeight: 0 },
  sheetScroll: { flex: 1, minHeight: 0 },
  sheetTitle: { ...sheetTypography.title },
  sheetOption: {
    minHeight: 44,
    borderRadius: 12,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: BG,
    marginBottom: 8,
  },
  sheetOptionText: { ...sheetTypography.option },
  sheetSearch: {
    ...sheetTypography.search,
    borderRadius: 12,
    backgroundColor: BG,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 10,
  },
  inlineEditor: {
    marginTop: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: BG,
    gap: 8,
  },
  inlineLabel: { ...sheetTypography.inlineLabel },
  sheetTextInput: {
    borderRadius: 10,
    backgroundColor: CARD,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: INK,
  },
  smallActionBtn: {
    borderRadius: 10,
    backgroundColor: INK,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  smallActionText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  sheetDoneBtn: {
    marginTop: 12,
    backgroundColor: INK,
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 12,
  },
  sheetDoneText: { ...sheetTypography.done },
});
