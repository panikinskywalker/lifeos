import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { RecordScreen } from '@ui/screens/RecordScreen';
import { SayCard } from '../../../../src/screens/SayCard';

export default function EntityDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <RecordScreen id={id!} say={(e) => <SayCard entity={e} />} />;
}
