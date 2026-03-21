import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Easing,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import type { EdgeInsets } from 'react-native-safe-area-context';
import { hapticSelection } from '../ui/haptics';
import { colors, radius, spacing } from '../ui/theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /**
   * **Required** — pass `useSafeAreaInsets()` from the **parent screen**.
   * React Native `Modal` renders in a separate tree: hooks inside the modal **do not** see the
   * app `SafeAreaProvider`, so insets are often all `0` and the sheet draws under the island/notch.
   */
  safeAreaInsets: EdgeInsets;
  /**
   * Max height of the sheet (px). Defaults to ~54% of window (cap 500).
   * Clamped to the vertical safe band using `safeAreaInsets`.
   */
  maxHeight?: number;
};

export function AppActionSheet({ visible, onClose, children, maxHeight, safeAreaInsets }: Props) {
  const { height: windowHeight } = useWindowDimensions();
  const topInset = safeAreaInsets.top;
  const bottomInset = safeAreaInsets.bottom;

  const safeInnerHeight = Math.max(0, windowHeight - topInset - bottomInset);
  const requestedHeight = maxHeight ?? Math.min(Math.round(windowHeight * 0.54), 500);
  const sheetHeight = Math.min(requestedHeight, safeInnerHeight);

  const translateY = useRef(new Animated.Value(sheetHeight)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const dragStartY = useRef(0);

  const closeAnimated = useCallback(() => {
    Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 160,
        easing: Easing.in(Easing.quad),
        useNativeDriver: false,
      }),
      Animated.timing(translateY, {
        toValue: sheetHeight,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: false,
      }),
    ]).start(({ finished }) => {
      if (finished) onClose();
    });
  }, [backdropOpacity, onClose, translateY, sheetHeight]);

  useEffect(() => {
    if (visible) {
      translateY.setValue(sheetHeight);
      backdropOpacity.setValue(0);
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 200,
          easing: Easing.out(Easing.quad),
          useNativeDriver: false,
        }),
        Animated.spring(translateY, {
          toValue: 0,
          tension: 68,
          friction: 14,
          useNativeDriver: false,
        }),
      ]).start();
      return;
    }

    translateY.setValue(sheetHeight);
    backdropOpacity.setValue(0);
  }, [visible, backdropOpacity, translateY, sheetHeight]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          translateY.stopAnimation((val) => {
            dragStartY.current = typeof val === 'number' ? val : 0;
          });
        },
        onPanResponderMove: (_, g) => {
          const next = Math.max(0, dragStartY.current + g.dy);
          translateY.setValue(next);
        },
        onPanResponderRelease: (_, g) => {
          const at = dragStartY.current + g.dy;
          const dismissThreshold = sheetHeight * 0.15;
          if (at > dismissThreshold || g.vy > 1.1) {
            void hapticSelection();
            closeAnimated();
            return;
          }
          Animated.spring(translateY, {
            toValue: 0,
            tension: 70,
            friction: 12,
            useNativeDriver: false,
          }).start();
        },
      }),
    [closeAnimated, translateY, sheetHeight]
  );

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={closeAnimated}>
      <View style={s.root}>
        <Animated.View style={[s.backdrop, { opacity: backdropOpacity }]} pointerEvents="box-none">
          <Pressable
            style={s.backdropPress}
            onPress={() => {
              void hapticSelection();
              closeAnimated();
            }}
          />
        </Animated.View>

        <View
          style={[
            s.safeSheetWrap,
            {
              paddingTop: topInset,
            },
          ]}
          pointerEvents="box-none"
        >
          <Animated.View
            style={[
              s.sheet,
              {
                height: sheetHeight + bottomInset,
                maxHeight: safeInnerHeight + bottomInset,
                transform: [{ translateY }],
              },
            ]}
          >
            <View style={s.sheetInner}>
              <View style={s.handleZone} {...panResponder.panHandlers}>
                <View style={s.handleBar} />
              </View>
              <View style={[s.body, { paddingBottom: bottomInset + 4 }]}>{children}</View>
            </View>
          </Animated.View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.28)',
    zIndex: 0,
  },
  backdropPress: {
    flex: 1,
  },
  safeSheetWrap: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    width: '100%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    overflow: 'hidden',
  },
  sheetInner: {
    flex: 1,
    minHeight: 0,
    backgroundColor: colors.surface,
  },
  handleZone: {
    minHeight: 44,
    width: '100%',
    paddingTop: 8,
    paddingBottom: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handleBar: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(11,8,3,0.18)',
  },
  body: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: spacing.sheetPaddingX,
    paddingTop: 4,
    paddingBottom: 4,
  },
});
