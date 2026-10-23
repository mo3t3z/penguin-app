import { useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, View } from 'react-native';
import { Camera, Eye, X, type LucideIcon } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/features/auth/provider';
import { usePenguinTheme, ThemeScope } from '@/theme/provider';
import { colors } from '@/theme/tokens';
import { shadowStyle } from '@/theme/shadow';
import { pickAndUploadProfilePhoto, type ProfilePhotoKind } from './photo-service';
import { useProfile } from './provider';

// The photo full screen on black; tap anywhere or Close to leave.
function PhotoViewer({ uri, onClose }: { uri: string | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return <Modal visible={uri !== null} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}><ThemeScope>
    <View className="flex-1 bg-black">
      <Pressable className="absolute inset-0 items-center justify-center" accessibilityLabel="Close photo" onPress={onClose}>
        {uri ? <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="contain" accessibilityIgnoresInvertColors /> : null}
      </Pressable>
      <Pressable className="absolute right-3 size-12 items-center justify-center rounded-full bg-white/15" style={{ top: insets.top + 8 }}
        accessibilityRole="button" accessibilityLabel="Close" onPress={onClose}>
        <X size={24} color="#FFFFFF" aria-hidden />
      </Pressable>
    </View>
  </ThemeScope></Modal>;
}

function SheetAction({ icon, label, onPress }: { icon: LucideIcon; label: string; onPress: () => void }) {
  return <Pressable className="min-h-14 flex-row items-center gap-3 rounded-md px-4 active:bg-muted" accessibilityRole="button" onPress={onPress}>
    <Icon as={icon} size={24} /><Text className="font-inter-medium">{label}</Text>
  </Pressable>;
}

// Wraps a profile photo. On your own profile a tap offers View photo (when there is
// one) and Change photo; on another student's it opens the photo directly.
export function ProfilePhotoActions({ kind, uri, own, children, label }: {
  kind: ProfilePhotoKind; uri: string | null; own: boolean; children: ReactNode; label: string;
}) {
  const { scheme } = usePenguinTheme();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { refresh } = useProfile();
  const [sheet, setSheet] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  async function change() {
    setSheet(false);
    const userId = session?.user.id;
    if (!userId || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(null);
    try { if (await pickAndUploadProfilePhoto(userId, kind)) await refresh(); }
    catch { setError('Penguin couldn’t update your photo. Check your connection and try again.'); }
    finally { inFlight.current = false; setBusy(false); }
  }

  const onPress = () => {
    if (busy) return;
    if (own) setSheet(true);
    else if (uri) setViewing(uri);
  };
  return <View>
    <Pressable onPress={onPress} disabled={!own && !uri} accessibilityRole="button" accessibilityLabel={label}>
      {children}
      {busy ? <View className="absolute inset-0 items-center justify-center rounded-full bg-black/40">
        <ActivityIndicator color="#FFFFFF" accessibilityLabel="Uploading photo" />
      </View> : null}
    </Pressable>
    {error ? <Text variant="caption" className="max-w-56 pt-1 text-destructive" accessibilityLiveRegion="polite">{error}</Text> : null}
    <Modal visible={sheet} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={() => setSheet(false)}><ThemeScope>
      <View className="flex-1 justify-end">
        <Pressable className="absolute inset-0" style={{ backgroundColor: colors[scheme].overlay }} accessibilityLabel="Close" onPress={() => setSheet(false)} />
        <View className="w-full rounded-t-xl bg-surface-raised px-3 pt-3" style={[shadowStyle('sheet', scheme), { paddingBottom: insets.bottom + 12 }]}
          accessibilityViewIsModal>
          <View className="mb-2 h-1 w-10 self-center rounded-full bg-border" />
          {uri ? <SheetAction icon={Eye} label={kind === 'avatar' ? 'View photo' : 'View cover'}
            onPress={() => { setSheet(false); setViewing(uri); }} /> : null}
          <SheetAction icon={Camera} label={kind === 'avatar' ? 'Change photo' : 'Change cover'} onPress={() => void change()} />
        </View>
      </View>
    </ThemeScope></Modal>
    <PhotoViewer uri={viewing} onClose={() => setViewing(null)} />
  </View>;
}
