import { useState } from 'react';
import { SearchSelection, type Selection } from '@/features/onboarding/search-selection';
import { SheetShell } from './sheet-shell';

type SelectorSheetProps = {
  kind: 'institution' | 'field';
  visible: boolean;
  selected: Selection | null;
  onConfirm: (value: Selection) => void;
  onClose: () => void;
};

// Mounted only while the sheet is open, so the temporary choice always starts from
// the saved one and is discarded when the sheet closes without confirming.
function OpenSelectorSheet({ kind, selected, onConfirm, onClose }: Omit<SelectorSheetProps, 'visible'>) {
  const [pending, setPending] = useState(selected);
  return <SheetShell
    visible
    title={kind === 'institution' ? 'Your institution' : 'Field of study'}
    confirmDisabled={!pending}
    onConfirm={() => { if (pending) onConfirm(pending); }}
    onClose={onClose}
  >
    <SearchSelection kind={kind} selected={pending} onSelect={setPending} />
  </SheetShell>;
}

// Searchable institution or field list in the Figma bottom sheet.
export function SelectorSheet({ visible, ...content }: SelectorSheetProps) {
  return visible ? <OpenSelectorSheet {...content} /> : null;
}
