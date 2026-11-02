import { Redirect, useLocalSearchParams } from 'expo-router';

/** Memory is the Second Brain's Facts half since R7f (docs/MODEL.md layer 2); old links land there. */
export default function MemoryRedirect() {
  const params = useLocalSearchParams<Record<string, string>>();
  return <Redirect href={{ pathname: '/board/[id]/[page]', params: { ...params, id: 'knowledge', page: 'facts' } } as never} />;
}
