import { Redirect } from 'expo-router';

/** Old links to /automation/new: the board's editor since R10. */
export default function NewRuleRedirect() {
  return <Redirect href={'/board/automation/edit' as never} />;
}
