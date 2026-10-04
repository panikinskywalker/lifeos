import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { FormScreen } from '@ui/screens/FormScreen';

export default function EditEntityRoute() {
  const { type, id } = useLocalSearchParams<{ type: string; id: string }>();
  return <FormScreen type={type!} id={id!} />;
}
