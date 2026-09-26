import { Redirect, useLocalSearchParams } from 'expo-router';

/** Old links to /talk: the one box on the centre tab answers questions now. */
export default function TalkRedirect() {
  const params = useLocalSearchParams<Record<string, string>>();
  return <Redirect href={{ pathname: '/dump', params } as never} />;
}
