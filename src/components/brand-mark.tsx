import { View } from 'react-native';
import Svg, { Ellipse, Path } from 'react-native-svg';
import { Text } from '@/components/ui/text';
import { usePenguinTheme } from '@/theme/provider';
import { colors } from '@/theme/tokens';

const sizes = { nav: { mark: 28, text: 23, line: 28 }, hero: { mark: 48, text: 32, line: 40 } } as const;

export function PenguinMark({ size = 28 }: { size?: number }) {
  const { scheme } = usePenguinTheme();
  const palette = colors[scheme];
  return <Svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden>
    <Path
      d="M24 2.4C14.4 2.4 11.52 10.2545 11.52 19.0909L6.72 35.7818L13.44 32.8364L15.36 45.6H32.64L34.56 32.8364L41.28 35.7818L36.48 19.0909C36.48 10.2545 33.6 2.4 24 2.4Z"
      fill={palette.foreground}
    />
    <Ellipse cx={24} cy={28} rx={7.68} ry={12} fill={palette.background} />
    <Path d="M19.68 12.96H28.32L24 17.76L19.68 12.96Z" fill={palette.primary} />
  </Svg>;
}

export function BrandMark({ variant = 'nav' }: { variant?: keyof typeof sizes }) {
  const { mark, text, line } = sizes[variant];
  return <View className="flex-row items-center gap-[9px]" accessible accessibilityRole="header" accessibilityLabel="Penguin">
    <PenguinMark size={mark} />
    <Text className="font-inter-bold text-foreground" style={{ fontSize: text, lineHeight: line }}>penguin</Text>
  </View>;
}
