import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { EntityDetailScreen } from '@ui/screens/EntityDetailScreen';
import { SayCard } from '../../../../src/screens/SayCard';

export default function EntityDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <EntityDetailScreen id={id!} say={(e) => <SayCard entity={e} />} />;
}
