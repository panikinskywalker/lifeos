import { useEffect, useState, type ReactNode } from 'react';
import { Image, View } from 'react-native';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';
import { reviewTurfSubmission, SETTING_SUBMISSIONS, submissionChanges, SUBMISSION_FIELDS, TURF_KEY, turfBase, type PlayerProfileData, type TurfSubmission } from '@modules/games';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { EmptyState, Screen, Text, useToast } from '@ui/kit';
import { usePull } from './useTurfSync';
import { Face } from './teams';
import { type Props, useBack } from './common';
import { HeaderRight, PillButton, TurfCard } from './dues';

/**
 * To check · Profile submission (TF-Submission): what a friend has now beside
 * what they sent, the changed values lime. Approve writes it to their profile
 * on Turf web, Turn down sends it back; both need Turf web to answer now
 * (reviewTurfSubmission), and the approved profile arrives with the next sync.
 */

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;
/** "+91 98••• ••12": a phone number shown, not read out in full. */
const maskPhone = (v: string) => {
  const d = v.replace(/\s+/g, '');
  if (d.length < 8) return v;
  const head = d.startsWith('+') ? `${d.slice(0, 3)} ${d.slice(3, 5)}` : d.slice(0, 2);
  return `${head}••• ••${d.slice(-2)}`;
};
const shown = (key: string, v: string | null | undefined) => (v == null || v === '' ? '—' : key === 'phone' ? maskPhone(String(v)) : String(v));

/** Turf web's address and this phone's key, for the photos (they need the key). */
function useTurfAuth() {
  const os = useOS();
  const [auth, setAuth] = useState<{ base: string; key: string } | null>(null);
  useEffect(() => {
    const base = turfBase(os);
    if (!base) return;
    let live = true;
    void os.device?.secrets
      ?.get(TURF_KEY)
      .then((key) => live && key && setAuth({ base, key }))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [os]);
  return auth;
}

function Photo({ uri, auth, ring, empty }: { uri: string | null; auth: { key: string } | null; ring?: boolean; empty: string }) {
  const t = useTheme();
  const [failed, setFailed] = useState(false);
  const ok = uri && auth && !failed;
  return (
    <View style={{ height: 120, borderRadius: 18, overflow: 'hidden', backgroundColor: t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center', borderWidth: ring ? 2 : 0, borderColor: t.c.accent.mustard }}>
      {ok ? (
        <Image source={{ uri, headers: { Authorization: `Bearer ${auth.key}` } }} onError={() => setFailed(true)} resizeMode="cover" accessibilityIgnoresInvertColors style={{ width: '100%', height: '100%' }} />
      ) : (
        <Text variant="caption" color="tertiary">
          {failed ? 'couldn’t load' : empty}
        </Text>
      )}
    </View>
  );
}

export function TurfSubmission({ params }: Props) {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const back = useBack();
  const toast = useToast();
  const { pull } = usePull();
  const auth = useTurfAuth();
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const id = params.sub ?? '';
  const data = useLive(
    (o) => {
      const sub = o.settings.get<Record<string, TurfSubmission>>(SETTING_SUBMISSIONS, {})[id];
      if (!sub) return null;
      const profile = sub.profileId ? o.records.get<PlayerProfileData>(sub.profileId) : undefined;
      const person = profile ? o.records.get<{ phone?: string; email?: string; upi?: string }>(profile.data.personId) : undefined;
      return { sub, profile, person };
    },
    [id],
  );

  const decide = async (decision: 'approve' | 'reject') => {
    if (!data) return;
    setBusy(decision);
    try {
      await reviewTurfSubmission(os, id, decision);
      toast.show({ message: decision === 'approve' ? `Approved · ${firstName(data.sub.name)}’s profile updates with the next sync` : `Turned down · ${firstName(data.sub.name)} is told on their page`, icon: 'check' });
      void pull(true);
      back();
    } catch (e) {
      toast.show({ message: (e as Error).message, icon: 'info' });
    } finally {
      setBusy(null);
    }
  };

  let body: ReactNode;
  if (!data) {
    body = <EmptyState icon="check-circle" line="This submission isn’t here any more — it was reviewed, or Turf web dropped it." action="Back" actionIcon="chevron-left" onAction={() => (router.canGoBack() ? router.back() : router.replace('/check' as never))} />;
  } else {
    const { sub, profile, person } = data;
    const changed = submissionChanges(sub, profile?.data, person?.data);
    const changedKeys = new Set(changed.map((c) => c.key));
    const photo = changedKeys.has('photoKey');
    // Changed first, then what they sent that matches what's there.
    const rows = [
      ...changed.filter((c) => c.key !== 'photoKey').map((c) => ({ key: c.key, label: c.label, was: c.was, next: c.next, diff: true })),
      ...SUBMISSION_FIELDS.flatMap((f) => {
        const v = sub.payload[f.key];
        if (f.key === 'photoKey' || changedKeys.has(f.key) || v === undefined || v === null || v === '') return [];
        const text = Array.isArray(v) ? v.join(', ') : String(v);
        return [{ key: f.key, label: f.label, was: text, next: text, diff: false }];
      }),
    ];
    const pending = sub.status === 'pending';
    const when = sub.submittedAt ? format(new Date(sub.submittedAt), 'EEE d MMM, h:mm a').replace('AM', 'am').replace('PM', 'pm') : null;
    const column = (side: 'was' | 'next') => (
      <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
        <Text variant="labelMicro" color="secondary" style={{ fontWeight: '700' }}>
          {side === 'was' ? 'Now' : 'Submitted'}
        </Text>
        {rows.map((r) => {
          const lime = side === 'next' && r.diff;
          return (
            <View key={r.key} style={{ minHeight: 38, justifyContent: 'center', gap: 1 }}>
              <Text variant="labelCaps" color="tertiary" numberOfLines={1} style={{ textTransform: 'uppercase' }}>
                {r.label}
              </Text>
              <Text variant="caption" color={lime ? t.c.accent.gold : 'primary'} numberOfLines={2} style={{ fontWeight: lime ? '700' : '500' }}>
                {shown(r.key, side === 'was' ? r.was : r.next)}
              </Text>
            </View>
          );
        })}
      </View>
    );
    body = (
      <>
        <TurfCard>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
            <Face id={profile?.data.personId ?? sub.playerId} name={sub.name} size={44} />
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text variant="rowTitle" style={{ fontWeight: '700' }}>
                {sub.name} {sub.fromPage ? 'edited' : 'submitted'} their profile
              </Text>
              <Text variant="caption" color="secondary">
                {[sub.fromPage ? 'From their own page' : 'Through your invite link', when, `${changed.length} change${changed.length === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}
              </Text>
            </View>
            <View style={{ height: 28, paddingHorizontal: 11, borderRadius: 999, justifyContent: 'center', backgroundColor: pending ? t.c.fg.primary : t.c.accent.mustard }}>
              <Text variant="labelMicro" color={t.c.bg.ground}>
                {pending ? 'To check' : sub.status === 'approved' ? 'Approved' : 'Turned down'}
              </Text>
            </View>
          </View>
        </TurfCard>
        <TurfCard gap={12}>
          {photo || profile?.data.photoPath ? (
            <>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Photo uri={auth && profile?.data.photoPath ? `${auth.base}/api/players/${encodeURIComponent(sub.playerId)}/photo` : null} auth={auth} empty="no photo" />
                  <Text variant="caption" color="tertiary" style={{ textAlign: 'center' }}>
                    Now
                  </Text>
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Photo uri={auth && photo ? `${auth.base}/api/invites?photoSubmissionId=${encodeURIComponent(sub.id)}` : null} auth={auth} ring={photo} empty="unchanged" />
                  <Text variant="caption" color={photo ? t.c.accent.gold : 'tertiary'} style={{ textAlign: 'center' }}>
                    {photo ? 'Submitted · new photo' : 'Submitted'}
                  </Text>
                </View>
              </View>
              <View style={{ height: 1, backgroundColor: t.c.line }} />
            </>
          ) : null}
          {rows.length ? (
            <View style={{ flexDirection: 'row', gap: 14 }}>
              {column('was')}
              <View style={{ width: 1, backgroundColor: t.c.line }} />
              {column('next')}
            </View>
          ) : (
            <Text variant="caption" color="secondary">
              {photo ? 'Only a new photo.' : 'Nothing different from their profile now.'}
            </Text>
          )}
        </TurfCard>
        {pending ? (
          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <PillButton title="Approve" icon="check" tone="lime" height={48} full busy={busy === 'approve'} disabled={!!busy} onPress={() => void decide('approve')} />
              <PillButton title="Turn down" icon="x" height={48} full busy={busy === 'reject'} disabled={!!busy} onPress={() => void decide('reject')} />
            </View>
            <Text variant="caption" color="tertiary" style={{ textAlign: 'center' }}>
              Approve writes the changes to {firstName(sub.name)}’s player profile on Turf web; Turn down sends it back to try again. Either way they’re told on their page. Both need Turf web online.
            </Text>
          </View>
        ) : null}
      </>
    );
  }
  return (
    <Screen title="Submission" subtitle="Turf · To check · profile" onBack={back} right={<HeaderRight />}>
      {body}
    </Screen>
  );
}
