import { z } from 'zod';
import type { AiToolDef } from '@core/registry/types';
import { currentGame, leaders, lineup, statsFor, summarise, whoOwes, allPlayers, type LeaderMetric } from './lib';

/** The games tools (R9a): read-only. Writing back to Turf Ledger arrives with R9b. */

function findPerson(os: Parameters<AiToolDef['run']>[1], name: string): string | null {
  const q = name.trim().toLowerCase();
  const players = allPlayers(os);
  const exact = players.find((p) => p.data.name.toLowerCase() === q || os.records.get(p.data.personId)?.title.toLowerCase() === q);
  if (exact) return exact.data.personId;
  const part = players.filter((p) => p.data.name.toLowerCase().includes(q));
  return part.length === 1 ? part[0]!.data.personId : null;
}

export const gamesAiTools: AiToolDef[] = [
  {
    name: 'turf_who_owes',
    description: 'Football (Turf Ledger): who still owes their share, how much and since when, biggest first.',
    input: z.object({}),
    run: async (_i, os) => whoOwes(os).map((o) => ({ name: o.name, amount: o.amount, shares: o.shares, since: o.oldest })),
  },
  {
    name: 'turf_this_week',
    description: 'Football (Turf Ledger): the next game (or the latest if none is planned): when, where, cost, the lineup and who has paid.',
    input: z.object({}),
    run: async (_i, os) => {
      const c = currentGame(os);
      if (!c) return { game: null };
      const s = summarise(os, c.game);
      return {
        upcoming: c.upcoming,
        game: { title: c.game.title, date: c.game.data.date, time: c.game.data.time, venue: c.game.data.venueName, cost: c.game.data.totalCost, score: c.game.data.scoreA != null ? `${c.game.data.scoreA}-${c.game.data.scoreB}` : null },
        players: s.players,
        collected: s.collected,
        outstanding: s.outstanding,
        lineup: lineup(os, c.game.id).map((l) => ({ name: l.name, team: l.appearance.data.team ?? null, share: l.appearance.data.share, paid: l.appearance.data.paid })),
      };
    },
  },
  {
    name: 'turf_player_stats',
    description: 'Football (Turf Ledger): one player’s record — games, goals, assists, saves, wins / draws / losses, man of the match, paid and unpaid shares.',
    input: z.object({ name: z.string().min(1).describe('The player, as you call them') }),
    run: async (input, os) => {
      const { name } = input as { name: string };
      const id = findPerson(os, name);
      return id ? statsFor(os, id) : { error: `No single player matches “${name}”` };
    },
  },
  {
    name: 'turf_leaders',
    description: 'Football (Turf Ledger): the top players by games, goals, assists, saves, wins or man of the match.',
    input: z.object({ metric: z.enum(['games', 'goals', 'assists', 'saves', 'wins', 'motm']).default('goals'), limit: z.number().int().min(1).max(25).default(5) }),
    run: async (input, os) => {
      const { metric, limit } = input as { metric: LeaderMetric; limit: number };
      return leaders(os, metric, limit).map((s) => ({ name: s.name, [metric]: s[metric], games: s.games }));
    },
  },
];
