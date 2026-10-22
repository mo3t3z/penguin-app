// Values copied by hand from ../src/theme/tokens.ts (do not import app code).
import {loadFont as loadArabic} from '@remotion/google-fonts/IBMPlexSansArabic';
import {loadFont as loadInter} from '@remotion/google-fonts/Inter';

export const colors = {
  dark: {
    background: '#15120F',
    card: '#1E1A16',
    foreground: '#F6F1EA',
    primary: '#FF7A00',
    accent: '#3A230F',
    border: '#332C25',
    mutedForeground: '#ADA399',
  },
  light: {background: '#FAF7F2', foreground: '#1C1712'},
  onPrimary: '#1C1712',
} as const;

export const fonts = {
  arabic: loadArabic('normal', {weights: ['400', '600', '700'], subsets: ['arabic', 'latin']}).fontFamily,
  numbers: loadInter('normal', {weights: ['600', '800'], subsets: ['latin']}).fontFamily,
};

export const VIDEO = {width: 1080, height: 1920, fps: 30, durationInFrames: 900};
// Social safe zone: keep text inside.
export const SAFE = {top: 150, bottom: 380, side: 60};
