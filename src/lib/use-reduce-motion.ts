import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

// Whether the system asks for less motion. Transitions become instant when it does.
export function useReduceMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => { if (active) setReduce(enabled); });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => { active = false; subscription.remove(); };
  }, []);
  return reduce;
}
