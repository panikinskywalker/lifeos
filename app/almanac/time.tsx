import React from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';

/** The old address (before R8): sends you on to `/time` with the same span and day. */
export default function OldTime() {
  const params = useLocalSearchParams<{ span?: string; day?: string }>();
  return <Redirect href={{ pathname: '/time', params } as never} />;
}
