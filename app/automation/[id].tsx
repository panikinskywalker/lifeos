import { Redirect, useLocalSearchParams } from 'expo-router';

/** Old links to /automation/<id>: the rule's page on the Automations board since R10. */
export default function RuleRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={`/board/automation/rule?rule=${encodeURIComponent(id ?? '')}` as never} />;
}
