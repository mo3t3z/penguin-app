import { useMemo, useRef, useState } from 'react';
import { Animated, Keyboard, PanResponder } from 'react-native';
import { useReduceMotion } from '@/lib/use-reduce-motion';
import { dragOffset, loweredOffset, sheetSwipeResult, type SheetPosition } from './sheet-swipe';

// Swipe up and down on the Create sheet. Attach `panHandlers` to the handle and
// header only, so the text and photos keep their own scrolling, and apply
// `translateY` to the sheet. `onClose` decides what closing means (it asks before
// discarding a draft); when it keeps the sheet open, the sheet springs back.
export function useSheetSwipe({ onClose, disabled }: { onClose: () => void; disabled: boolean }) {
  const reduceMotion = useReduceMotion();
  const [translateY] = useState(() => new Animated.Value(0));
  // Read and written only inside gesture and layout callbacks.
  const position = useRef<SheetPosition>('expanded');
  const height = useRef(0);

  const panHandlers = useMemo(() => {
    const settle = (to: SheetPosition) => {
      position.current = to;
      const value = to === 'expanded' ? 0 : loweredOffset(height.current);
      if (reduceMotion) translateY.setValue(value);
      else Animated.spring(translateY, { toValue: value, useNativeDriver: true, bounciness: 0, speed: 18 }).start();
    };
    // PanResponder calls these during gestures only, never while rendering; the
    // compiler cannot see that, so it would flag the refs they read.
    // eslint-disable-next-line react-hooks/refs
    return PanResponder.create({
      // Only clear vertical drags take over; taps on Cancel and Post still work.
      onMoveShouldSetPanResponder: (_, g) => !disabled && Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderGrant: () => Keyboard.dismiss(),
      onPanResponderMove: (_, g) => translateY.setValue(dragOffset(position.current, g.dy, height.current)),
      onPanResponderRelease: (_, g) => {
        const result = sheetSwipeResult(position.current, g.dy, g.vy);
        if (result === 'close') { settle(position.current); onClose(); }
        else settle(result);
      },
      onPanResponderTerminate: () => settle(position.current),
    }).panHandlers;
  }, [disabled, onClose, reduceMotion, translateY]);
  const onSheetLayout = useMemo(() => (sheetHeight: number) => { height.current = sheetHeight; }, []);

  return { panHandlers, translateY, onSheetLayout };
}
