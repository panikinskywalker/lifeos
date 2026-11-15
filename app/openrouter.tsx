import { Redirect } from 'expo-router';

/** OpenRouter's sign-in comes back to lifeos://openrouter; the sign-in itself reads the code, this just lands on You › Agent. */
export default function OpenRouterReturn() {
  return <Redirect href={'/settings/ai' as never} />;
}
