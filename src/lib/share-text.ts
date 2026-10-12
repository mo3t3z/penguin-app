import { Share } from 'react-native';

// Opens the system share sheet. Dismissing it, or a platform without one, is not
// an error the student needs to see.
export async function shareText(message: string) {
  try {
    await Share.share({ message });
  } catch {
    // Nothing to recover: the sheet was unavailable or closed.
  }
}
