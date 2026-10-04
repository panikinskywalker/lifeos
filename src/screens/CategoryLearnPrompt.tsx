import { useEffect } from 'react';
import { bus } from '@core/events/bus';
import { recategorise } from '@core/ingest/ingest';
import { categoryOf } from '@modules/finance/types';
import { useOS } from '@ui/hooks';
import { useToast } from '@ui/kit';

/**
 * After you recategorise a payment: "Canoe is Food & Drink from now on —
 * change the 6 earlier ones too?" One tap changes them (with Undo).
 */
export function CategoryLearnPrompt() {
  const os = useOS();
  const toast = useToast();
  useEffect(
    () =>
      bus.on('category.learned', ({ category, payee, others }) => {
        const name = categoryOf(category).label;
        toast.show({
          message: `${payee} is ${name} from now on. ${others.length} earlier ${others.length === 1 ? 'payment says' : 'payments say'} something else.`,
          icon: 'tag',
          action: {
            label: others.length === 1 ? 'Change it' : `Change ${others.length}`,
            onPress: () => {
              const done = recategorise(os, others, category);
              toast.show({
                message: `${done.length} ${done.length === 1 ? 'payment' : 'payments'} moved to ${name}`,
                icon: 'check',
                undo: () => {
                  for (const d of done) os.records.update(d.id, { data: { category: d.was } }, 'system');
                },
              });
            },
          },
        });
      }),
    [os, toast],
  );
  return null;
}
