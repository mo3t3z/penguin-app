import { Image } from 'react-native';
import { PenguinWordmark } from '@/components/penguin-wordmark';
import { usePenguinTheme } from '@/theme/provider';

// Raster brand art cut from the supplied references. The small files serve marks
// up to 96px; larger marks use the full-size mascot.
const mascot = require('../../assets/penguin-mascot.png');
const mascotSmall = require('../../assets/penguin-mascot-small.png');
const iconSmall = require('../../assets/penguin-icon-small.png');
const MASCOT_ASPECT = 1148 / 1113;
const SMALL_LIMIT = 96;

// The mascot as an illustration. It is not the in-app logo (that is the text-only
// wordmark below); today only the Welcome artwork uses it. Its head is black, so
// on the dark theme it would disappear into the page background: 'auto' shows the
// standalone mascot on light and the app icon tile on dark, and 'mascot' always
// shows the standalone mascot, for a surface that is not the page background.
export function PenguinMark({ size = 28, variant = 'auto' }: { size?: number; variant?: 'auto' | 'mascot' }) {
  const { scheme } = usePenguinTheme();
  if (variant === 'auto' && scheme === 'dark') {
    return <Image source={iconSmall} style={{ width: size, height: size, borderRadius: size * 0.23 }} aria-hidden />;
  }
  return <Image
    source={size > SMALL_LIMIT ? mascot : mascotSmall}
    style={{ width: size * MASCOT_ASPECT, height: size }}
    resizeMode="contain"
    aria-hidden
  />;
}

// In-app branding is the text-only wordmark: no mascot and no icon tile.
export function BrandMark({ variant = 'nav' }: { variant?: 'nav' | 'hero' }) {
  return <PenguinWordmark size={variant} />;
}
