import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { RuleEditor } from '../../src/ui/screens/RuleEditor';

export default function EditRuleRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <RuleEditor id={id} />;
}
