import { useEffect, useState } from 'react';
import { getProfileReferences } from './service';

type References = Awaited<ReturnType<typeof getProfileReferences>>;
export function useProfileReferences(userId: string, institutionId: string | null, fieldId: string | null) {
  const [attempt, setAttempt] = useState(0);
  const key = `${userId}:${institutionId}:${fieldId}:${attempt}`;
  const [result, setResult] = useState<{ key: string; data: References | null; failed: boolean } | null>(null);
  useEffect(() => {
    let active = true;
    void getProfileReferences(institutionId, fieldId).then(data => {
      if (active) setResult({ key, data, failed: false });
    }).catch(() => { if (active) setResult({ key, data: null, failed: true }); });
    return () => { active = false; };
  }, [institutionId, fieldId, key]);
  return {
    loading: result?.key !== key,
    failed: result?.key === key && result.failed,
    data: result?.key === key ? result.data : null,
    retry: () => setAttempt(value => value + 1),
  };
}
