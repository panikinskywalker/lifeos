import React from 'react';
import { useOS } from '@ui/hooks';
import { BarLayout } from '../../../src/screens/InsideBar';

/** A module keeps a bottom bar: its companion board's sections when it declares them, else the app's. */
export default function ModuleLayout() {
  const os = useOS();
  return <BarLayout kind="module" board={(id) => os.registry.boardFor(id)} />;
}
