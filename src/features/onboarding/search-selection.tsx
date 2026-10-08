import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { Text } from '@/components/ui/text';
import { Skeleton } from '@/components/ui/skeleton';
import { listFields, listInstitutions } from '@/features/profile/service';

export type Selection = { id: string; name: string };
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
        if (active) setResult({ key, rows, error: false });
      }).catch(() => { if (active) setResult({ key, rows: [], error: true }); });
    }, 350);
    return () => { active = false; clearTimeout(timer); };
  }, [kind, search, page, attempt, key]);
  return <View className="gap-4">
    <FormField label={`Search ${kind === 'institution' ? 'institutions' : 'fields of study'}`} variant="search"
      value={search} onChangeText={value => { setSearch(value); setPage(0); }} autoCorrect={false} maxLength={120} editable={!disabled} />
    {selected ? <Card variant="highlighted"><CardContent><Text variant="small">Selected</Text><Text>{selected.name}</Text></CardContent></Card> : null}
    {loading ? <><Text accessibilityLiveRegion="polite">Loading choices…</Text><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></> : result?.error ? <>
      <Text accessibilityLiveRegion="polite">We couldn’t load these choices. Check your connection and retry.</Text>
      <Button variant="outline" disabled={disabled} onPress={() => setAttempt(value => value + 1)}><Text>Retry search</Text></Button>
    </> : <>
      {!result?.rows.length ? <Card variant="muted"><CardContent className="gap-3">
        <Text variant="h3">{search ? 'No matches yet.' : 'Choices are coming soon.'}</Text>
        <Text>{search ? 'Try a shorter name or clear your search.' : `There are no ${kind === 'institution' ? 'institutions' : 'fields of study'} to choose from yet. You can go back without losing your details, then retry once Penguin’s list is ready.`}</Text>
        <Button variant="outline" disabled={disabled} onPress={() => { setSearch(''); setPage(0); setAttempt(value => value + 1); }}><Text>{search ? 'Clear search' : 'Reload choices'}</Text></Button>
      </CardContent></Card> : result.rows.map(item => <Button key={item.id} variant={selected?.id === item.id ? 'secondary' : 'outline'}
        disabled={disabled} className="justify-start" accessibilityState={{ selected: selected?.id === item.id }} onPress={() => onSelect(item)}>
        <Text className="flex-1 shrink">{selected?.id === item.id ? '✓ ' : ''}{item.name}</Text>
      </Button>)}
      <View className="flex-row flex-wrap gap-3">
        {page > 0 ? <Button variant="ghost" disabled={disabled} onPress={() => setPage(value => value - 1)}><Text>Previous results</Text></Button> : null}
        {result?.rows.length === 20 ? <Button variant="ghost" disabled={disabled} onPress={() => setPage(value => value + 1)}><Text>More results</Text></Button> : null}
      </View>
    </>}
  </View>;
}
