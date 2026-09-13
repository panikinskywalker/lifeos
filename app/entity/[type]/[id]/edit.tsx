import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { EntityFormScreen } from '@ui/screens/EntityFormScreen';

export default function EditEntityRoute() {
  const { type, id } = useLocalSearchParams<{ type: string; id: string }>();
  return <EntityFormScreen type={type!} id={id!} />;
}
