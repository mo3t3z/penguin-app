import { useEffect, useState } from 'react';
import { Keyboard, Platform, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { navContentPadding, navLayout, type NavLayout } from './nav-layout';

function useKeyboardVisible() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    // iOS announces the keyboard before it moves; Android only once it has.
    const [show, hide] = Platform.OS === 'ios'
      ? ['keyboardWillShow', 'keyboardWillHide'] as const
      : ['keyboardDidShow', 'keyboardDidHide'] as const;
    const subscriptions = [
      Keyboard.addListener(show, () => setVisible(true)),
      Keyboard.addListener(hide, () => setVisible(false)),
    ];
    return () => subscriptions.forEach((subscription) => subscription.remove());
  }, []);
  return visible;
}

// The one place that decides between the floating island, the docked bar and no
// bar. `fontScale` from the window follows the system text size.
export function useNavLayout(): NavLayout {
  const { width, fontScale } = useWindowDimensions();
  const { bottom } = useSafeAreaInsets();
  const keyboardVisible = useKeyboardVisible();
  return navLayout({ width, bottomInset: bottom, fontScale, keyboardVisible });
}

// Bottom padding for the lists of the tab screens, which scroll under the navigation.
export function useNavContentPadding() {
  const layout = useNavLayout();
  const { bottom } = useSafeAreaInsets();
  return navContentPadding(layout, bottom);
}
