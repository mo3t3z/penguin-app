import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { BookOpen, Building2, Search } from 'lucide-react-native';
import { SelectorOption } from '@/components/forms/selector-option';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { Skeleton } from '@/components/ui/skeleton';
import { listFields, listInstitutions } from '@/features/profile/service';

export type Selection = { id: string; name: string; detail?: string | null };

type ReferenceRow = { id: string; name: string; city?: string | null; country?: string | null };

// Institutions show "City, COUNTRY" under the name when the data has it; fields
// only have a name.
function toSelection(row: ReferenceRow): Selection {
  const detail = [row.city, row.country].filter(Boolean).join(', ');
  return { id: row.id, name: row.name, detail: detail || null };
}

function Eyebrow({ children }: { children: string }) {
  return <Text className="font-inter-medium text-micro uppercase tracking-wide text-muted-foreground">{children}</Text>;
}

export function SearchSelection({ kind, selected, onSelect, disabled = false }: {
  kind: 'institution' | 'field'; selected: Selection | null; onSelect: (value: Selection) => void; disabled?: boolean;
}) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; rows: Selection[]; error: boolean } | null>(null);
  const key = `${search}-${page}-${attempt}`;
  const loading = result?.key !== key;
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      const request = kind === 'institution' ? listInstitutions : listFields;
      void request({ search, limit: 20, offset: page * 20 }).then(rows => {
        if (active) setResult({ key, rows: (rows as ReferenceRow[]).map(toSelection), error: false });
      }).catch(() => { if (active) setResult({ key, rows: [], error: true }); });
    }, 350);
    return () => { active = false; clearTimeout(timer); };
  }, [kind, search, page, attempt, key]);
  const plural = kind === 'institution' ? 'institutions' : 'fields of study';
  const icon = kind === 'institution' ? Building2 : BookOpen;
  const rows = result?.rows ?? [];
  const selectedListed = !loading && rows.some(item => item.id === selected?.id);
  return <View className="gap-3">
    <Input variant="search" leadingIcon={Search} placeholder={`Search ${plural}`} accessibilityLabel={`Search ${plural}`}
      value={search} onChangeText={value => { setSearch(value); setPage(0); }} autoCorrect={false} maxLength={120} editable={!disabled} />
    {selected && !selectedListed ? <View className="gap-3">
      <Eyebrow>Selected</Eyebrow>
      <SelectorOption icon={icon} title={selected.name} detail={selected.detail} selected disabled={disabled} onPress={() => onSelect(selected)} />
    </View> : null}
    {loading ? <><Text variant="muted" accessibilityLiveRegion="polite">Loading choices…</Text><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></> : result?.error ? <>
      <Text accessibilityLiveRegion="polite">We couldn’t load these choices. Check your connection and retry.</Text>
      <Button variant="outline" disabled={disabled} onPress={() => setAttempt(value => value + 1)}><Text>Retry search</Text></Button>
    </> : <>
      {!rows.length ? <Card variant="muted"><CardContent className="gap-3">
        <Text variant="h4">{search ? 'No matches yet.' : 'Choices are coming soon.'}</Text>
        <Text variant="muted">{search ? 'Try a shorter name or clear your search.' : `There are no ${plural} to choose from yet. You can go back without losing your details, then retry once Penguin’s list is ready.`}</Text>
        <Button variant="outline" disabled={disabled} onPress={() => { setSearch(''); setPage(0); setAttempt(value => value + 1); }}><Text>{search ? 'Clear search' : 'Reload choices'}</Text></Button>
      </CardContent></Card> : <View className="gap-3" accessibilityRole="radiogroup">
        <Eyebrow>{search.trim() ? `Matching ${kind === 'institution' ? 'institutions' : 'fields'}` : kind === 'institution' ? 'Institutions' : 'Fields of study'}</Eyebrow>
        {rows.map(item => <SelectorOption key={item.id} icon={icon} title={item.name} detail={item.detail}
          selected={selected?.id === item.id} disabled={disabled} onPress={() => onSelect(item)} />)}
      </View>}
      {page > 0 || rows.length === 20 ? <View className="flex-row flex-wrap gap-3">
        {page > 0 ? <Button variant="ghost" disabled={disabled} onPress={() => setPage(value => value - 1)}><Text>Previous results</Text></Button> : null}
        {rows.length === 20 ? <Button variant="ghost" disabled={disabled} onPress={() => setPage(value => value + 1)}><Text>More results</Text></Button> : null}
      </View> : null}
    </>}
  </View>;
}
