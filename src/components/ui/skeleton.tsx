import { cn } from '@/lib/utils';
import { View } from 'react-native';

function Skeleton({
  className,
  ...props
}: React.ComponentProps<typeof View> & React.RefAttributes<View>) {
  // Static: no looping animation cost and safe for reduced motion.
  return <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" className={cn('bg-muted rounded-md', className)} {...props} />;
}

export { Skeleton };

