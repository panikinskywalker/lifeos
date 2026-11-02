import { Redirect } from 'expo-router';

/** Old links to /automation: the Automations board holds the rules since R10. */
export default function AutomationRedirect() {
  return <Redirect href={'/board/automation' as never} />;
}
