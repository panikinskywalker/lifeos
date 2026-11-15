import React from 'react';
import { useOS } from '@ui/hooks';
import { BarLayout } from '../../../src/screens/InsideBar';

/** A board keeps a bottom bar: its own sections when it declares them (Turf), else the app's. */
export default function BoardLayout() {
  const os = useOS();
  return <BarLayout kind="board" board={(id) => os.registry.boards.get(id)} />;
}
