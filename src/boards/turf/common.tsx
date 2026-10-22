import { useEffect, useState } from 'react';
import { Pressable, RefreshControl, View } from 'react-native';
import { useRouter } from 'expo-router';
import { format, formatDistanceToNow } from 'date-fns';
import type { LifeOSContext } from '@core/registry/context';
import { sourceState } from '@core/sources/deviceData';
import { allGames, allPlayers, allVenues, currentGame, isSending, markPaid, mePersonId, turfBase, leaders, lineup, moneyAtAGlance, owedOn, recordPayment, statsFor, summarise, turfChanges, whoOwes, kitsOf, ATTENDANCE, PAYMENT_TERMS, type AppearanceData, type LeaderMetric, type PaymentKind } from '@modules/games';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { usePull } from './useTurfSync';
import { MatchPlayerSheet, ScoreSheet } from './match';
import { Crest, Display, Face, GoalBall, Pitch, SideLists, SyncPill, pitchPlayers } from './teams';
import { Button, Card, EmptyState, Icon, IconButton, NumberField, RowItem, RowList, Screen, Section, Segmented, Sheet, Stat, StatTrio, Text, TextField, useToast } from '@ui/kit';
import { NotConnectedCard } from './states';

/** Shared by the Turf board's screens (docs/MODEL.md layer 3, *Turf*). */
export type Props = { ctx: LifeOSContext; params: Record<string, string> };

export const TINT = 'health' as const;
export const shortDay = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

export function useBack() {
  const router = useRouter();
  return () => (router.canGoBack() ? router.back() : router.replace('/browse'));
}

export function NotConnected() {
  return <NotConnectedCard />;
}
