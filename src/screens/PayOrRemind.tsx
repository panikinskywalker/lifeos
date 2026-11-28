import React, { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import type { ObjectRecord } from '@core/domain/types';
import { PHOTO_MODEL } from '@core/ai/brainModel';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Button, FilterChip, Sheet, Text, TextField, useToast } from '@ui/kit';
import type { DebtData } from '@modules/finance/split';
import { isUpiId, plainReminder, upiLink, upiOf } from '@modules/finance/settleUpi';

/**
 * On a person (NR-Money-Splitwise-Person): Pay by UPI when you owe them (your
 * UPI app opens with their UPI ID, the amount and a note), Remind when they
 * owe you (a short message, written by Haiku with their name as a
 * placeholder, sent on WhatsApp), and their UPI ID, kept on their record.
 * Shared by Money's person section and Udhari's rows.
 */
export function PayOrRemind({ personId, name, balance, open, compact }: { personId: string; name: string; balance: number; open: Array<ObjectRecord<DebtData>>; /** A small pill for a list row (Udhari): Remind, or Pay ₹450; no UPI ID line. */ compact?: boolean }) {
  const os = useOS();
  const t = useTheme();
  const toast = useToast();
  const upi = useLive((o) => upiOf(o, personId), [personId]);
  const phone = useLive((o) => o.records.get<{ phone?: string }>(personId)?.data.phone ?? null, [personId]);
  const [editing, setEditing] = useState(false);
  const [typed, setTyped] = useState('');
  const [remind, setRemind] = useState<{ text: string; busy: boolean } | null>(null);
  const [tone, setTone] = useState('Friendly');
  const first = name.split(' ')[0] ?? name;
  const amount = os.format.currency(Math.abs(balance));
  const what = [...new Set(open.map((d) => (d.data.reason ?? '').replace(/ at .*$/, '').trim()).filter(Boolean))].slice(0, 2).join(' and ').toLowerCase();

  const pay = (id = upi) => {
    if (!id) return setEditing(true);
    const note = open[0]?.data.reason ? `${open[0].data.reason}`.slice(0, 40) : 'Settling up';
    void Linking.openURL(upiLink({ upi: id, name, amount: Math.abs(balance), note })).catch(() => toast.show({ message: 'No UPI app answered', icon: 'alert' }));
  };
  const write = async (style: string) => {
    setRemind({ text: remind?.text ?? plainReminder(first, amount, what), busy: true });
    const model = await os.device?.brain?.model(PHOTO_MODEL).catch(() => null);
    if (!model) return setRemind({ text: plainReminder(first, amount, what), busy: false });
    try {
      // Their name never leaves the phone: the model writes to {name}.
      const r = await model.complete({ system: 'Write one payment reminder as a WhatsApp message to a friend. No preamble, no quotes, under 40 words. Address them as {name}.', user: `Tone: ${style}. They owe me ${amount}${what ? ` for ${what}` : ''}.${style === 'With my UPI' ? ' Say they can pay by UPI.' : ''}`, maxTokens: 200 });
      os.brain.sent.add({ at: Date.now(), pass: 'remind', why: 'you pressed Remind', model: model.model, lines: [`Money · a reminder: the amount${what ? ' and what for' : ''}; the name as {name}`], records: 0, ...r.usage, outcome: 'ok', error: null });
      setRemind({ text: r.text.trim().replace(/\{name\}/g, first) || plainReminder(first, amount, what), busy: false });
    } catch {
      setRemind({ text: plainReminder(first, amount, what), busy: false });
    }
  };
  const send = () => {
    if (!remind) return;
    const digits = (phone ?? '').replace(/\D/g, '');
    const to = digits.length === 10 ? `91${digits}` : digits;
    void Linking.openURL(to ? `https://wa.me/${to}?text=${encodeURIComponent(remind.text)}` : `whatsapp://send?text=${encodeURIComponent(remind.text)}`).catch(() => toast.show({ message: 'WhatsApp did not open', icon: 'alert' }));
    setRemind(null);
  };
  const saveUpi = () => {
    const v = typed.trim();
    if (!isUpiId(v)) return toast.show({ message: 'That is not a UPI ID, like name@bank', icon: 'alert' });
    os.records.update(personId, { data: { upi: v } }, 'user');
    setEditing(false);
    if (balance < 0) pay(v);
  };

  return (
    <View style={{ gap: 10 }}>
      {compact ? (
        balance !== 0 ? (
          <Pressable accessibilityRole="button" accessibilityLabel={balance < 0 ? `Pay ${first} ${amount} by UPI` : `Remind ${first}`} onPress={() => (balance < 0 ? pay() : void write(tone))} style={({ pressed }) => ({ height: 34, paddingHorizontal: 14, borderRadius: 999, justifyContent: 'center', backgroundColor: balance < 0 ? t.c.alert.coralText : t.c.bg.tileRaised, opacity: pressed ? 0.8 : 1 })}>
            <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '700', color: balance < 0 ? '#0B0B0D' : t.c.fg.primary }}>{balance < 0 ? `Pay ${os.format.currency(Math.round(Math.abs(balance)))}` : 'Remind'}</Text>
          </Pressable>
        ) : null
      ) : (
        <>
          {balance < 0 ? <Button title={`Pay ${amount} by UPI`} icon="arrow-up" onPress={() => pay()} block /> : null}
          {balance > 0 ? <Button title="Remind" icon="comment" variant="secondary" onPress={() => void write(tone)} block /> : null}
        </>
      )}
      {compact ? null : <Pressable accessibilityRole="button" accessibilityLabel={upi ? `UPI ID ${upi}. Change` : 'Add their UPI ID'} onPress={() => { setTyped(upi ?? ''); setEditing(true); }}>
        <Text color="secondary" style={{ fontSize: 13, lineHeight: 18 }}>{upi ? `UPI ID ${upi} · kept on this phone · change` : 'Add their UPI ID, to pay them in one tap'}</Text>
      </Pressable>}
      <Sheet visible={editing} onClose={() => setEditing(false)} title={`${first}'s UPI ID`} footer={<Button title={balance < 0 ? `Save and pay ${amount}` : 'Save'} onPress={saveUpi} disabled={!typed.trim()} />}>
        <TextField label="UPI ID" value={typed} onChange={setTyped} placeholder="name@okhdfc" autoFocus />
      </Sheet>
      <Sheet visible={!!remind} onClose={() => setRemind(null)} title={`Remind ${first}`} footer={<Button title="Send on WhatsApp" icon="comment" onPress={send} disabled={!remind || remind.busy} />}>
        <View style={{ gap: 12 }}>
          <View style={{ alignSelf: 'flex-end', maxWidth: '88%', padding: 14, borderRadius: 22, borderBottomRightRadius: 6, backgroundColor: '#1F6B4A' }}>
            <Text style={{ fontSize: 15, lineHeight: 21, color: '#F5F5F7', opacity: remind?.busy ? 0.6 : 1 }}>{remind?.text}</Text>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {['Friendly', 'Short', 'Funny', 'With my UPI'].map((x) => (
              <FilterChip key={x} label={x} selected={tone === x} onPress={() => { setTone(x); void write(x); }} />
            ))}
          </View>
          <Text color="secondary" style={{ fontSize: 12, lineHeight: 16 }}>Written by Claude Haiku with the amount and what for; {first}'s name stays on the phone.</Text>
        </View>
      </Sheet>
    </View>
  );
}
