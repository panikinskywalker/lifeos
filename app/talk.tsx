import { Redirect, useLocalSearchParams } from 'expo-router';

/** Old links to /talk (Talk is now the second half of the Dump tab). */
export default function TalkRedirect() {
  const params = useLocalSearchParams<Record<string, string>>();
  return <Redirect href={{ pathname: '/dump', params: { ...params, mode: 'talk' } } as never} />;
}
