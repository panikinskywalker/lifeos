import type { TurfSyncPage } from '../sync';

/**
 * A first sync page (since 0), shaped like Turf web's GET /api/sync: raw table
 * rows, money in rupees except payments (cents). Names, numbers and UPI IDs
 * are made up. Rutvij fronts the Sat game and is "you" in Turf web's settings;
 * Priya fronts the Wed one. Shares ticked paid carry their opening entries
 * from the Turf Ledger import; Arjun has paid ₹200 of his ₹450 from LifeOS.
 * Used by the games tests and the demo seed.
 */
const player = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id, name, phone: null, email: null, position: null, notes: null, payment_id: null, photo_key: null, kind: 'regular',
  comfortable_positions: null, goalkeeper_willing: null, goalkeeper_rating: null, initial_ability: null,
  availability_mode: 'regular', weekly_availability: 'all_week', default_availability: 'AVL', public_slug: null, rev: 1, ...extra,
});
const share = (game: string, playerId: string, amount: number, paid: boolean, extra: Record<string, unknown> = {}) => ({
  game_id: game, player_id: playerId, share_amount: amount, paid: paid ? 1 : 0, paid_at: paid ? '2026-10-18 09:00:00' : null,
  team: null, field_position: null, goals: 0, own_goals: 0, assists: 0, saves: 0, played_goalkeeper: 0, attendance_status: 'confirmed', rev: 5, ...extra,
});
const entry = (id: string, game: string, playerId: string, cents: number, kind = 'opening', via = 'import') => ({
  id, game_id: game, player_id: playerId, amount_cents: cents, kind, note: null, via, recorded_by: via === 'import' ? null : 'LifeOS · S22', action_id: null, device: null, created_at: '2026-10-18T09:00:00.000Z', rev: 6,
});

export const sampleSync: TurfSyncPage = {
  since: 0,
  rev: 40,
  tables: {
    settings: [{ key: 'ownerPlayerId', value: '"p_rutvij"', rev: 2 }, { key: 'squadName', value: '"Saturday football"', rev: 2 }],
    players: [
      player('p_rutvij', 'Rutvij', { phone: '+91 98200 00001', position: 'Midfielder', payment_id: 'rutvij@okicici', preferred_foot: 'Right', initial_ability: 72, pace: 4, stamina: 4, defending: 3, passing: 4, dribbling: 3, shooting: 3, public_slug: 'rutvij-x1', comfortable_positions: '["CM","RW"]' }),
      player('p_priya', 'Priya', { phone: '98200 00002', email: 'priya@example.com', position: 'Defender', payment_id: 'priya.s@okaxis', goalkeeper_willing: 1, goalkeeper_rating: 6.5, public_slug: 'priya-x2' }),
      player('p_karan', 'Karan', { phone: '+919820000003', position: 'Forward', speciality: 'Finishing', default_availability: 'INJ' }),
      player('p_arjun', 'Arjun', { position: 'Goalkeeper' }),
      player('p_guest', 'Neel (guest)', { kind: 'guest' }),
    ],
    player_availability_periods: [{ id: 'av_karan', player_id: 'p_karan', status: 'INJ', starts_at: '2026-10-10', ends_at: '2026-10-24', note: 'Ankle', rev: 3 }],
    venues: [
      { id: 'v_play', name: 'Playground Arena', default_time: '20:00', side_size: 6, default_cost: 1800, maps_link: 'https://maps.app.goo.gl/abc', payment_terms: 'postpaid', advance_amount: null, photo_key: 'venues/v_play.jpg', notes: null, rev: 4 },
      { id: 'v_dome', name: 'Dome Turf', default_time: '07:00', side_size: 5, default_cost: 1500, maps_link: null, payment_terms: 'advance_paid', advance_amount: 500, photo_key: null, notes: 'Bring bibs', rev: 4 },
    ],
    games: [
      { id: 'g_sat', date: '2026-10-17', time: '20:00', venue: 'Playground Arena', venue_id: 'v_play', side_size: 6, team_a_color: '#2f80ed', team_b_color: '#f05a45', team_a_score: 7, team_b_score: 5, goal_data_quality: 'complete', motm_player_id: 'p_karan', fronted_by_player_id: 'p_rutvij', payment_terms: 'postpaid', advance_amount: null, public_slug: 'sat-17', captain_a_player_id: 'p_rutvij', captain_b_player_id: 'p_priya', total_amount: 1800, expected_players: 4, rev: 5 },
      { id: 'g_wed', date: '2026-10-14', time: '07:00', venue: 'Dome Turf', venue_id: 'v_dome', side_size: 5, team_a_score: 3, team_b_score: 3, goal_data_quality: 'partial', motm_player_id: null, fronted_by_player_id: 'p_priya', payment_terms: 'advance_paid', advance_amount: 500, public_slug: 'wed-14', total_amount: 1500, expected_players: 3, rev: 5 },
      { id: 'g_next', date: '2026-10-24', time: '20:00', venue: 'Playground Arena', venue_id: 'v_play', side_size: 6, team_a_score: null, team_b_score: null, goal_data_quality: 'missing', fronted_by_player_id: null, payment_terms: 'tentative', total_amount: 1800, expected_players: 12, rev: 5 },
    ],
    match_rsvps: [
      { game_id: 'g_sat', player_id: 'p_karan', status: 'in', responded_at: '2026-10-15T10:00:00Z', rev: 5 },
      { game_id: 'g_next', player_id: 'p_priya', status: 'in', responded_at: '2026-10-18T08:00:00Z', rev: 5 },
      { game_id: 'g_next', player_id: 'p_arjun', status: 'maybe', responded_at: '2026-10-18T08:05:00Z', rev: 5 },
    ],
    game_players: [
      share('g_sat', 'p_rutvij', 450, true, { team: 'A', field_position: 'CM', goals: 2, assists: 1 }),
      share('g_sat', 'p_karan', 450, false, { team: 'A', field_position: 'ST', goals: 4 }),
      share('g_sat', 'p_priya', 450, true, { team: 'B', field_position: 'CB', goals: 1, assists: 2, attendance_status: 'late' }),
      share('g_sat', 'p_arjun', 450, false, { team: 'B', field_position: 'GK', saves: 9, played_goalkeeper: 1 }),
      share('g_wed', 'p_rutvij', 500, false, { team: 'A', goals: 1 }),
      share('g_wed', 'p_priya', 500, true, { team: 'B', goals: 2 }),
      share('g_wed', 'p_karan', 500, false, { team: 'A', goals: 2, assists: 1 }),
      share('g_next', 'p_priya', 150, false),
    ],
    payments: [
      entry('pay_1', 'g_sat', 'p_rutvij', 45000),
      entry('pay_2', 'g_sat', 'p_priya', 45000),
      entry('pay_3', 'g_wed', 'p_priya', 50000),
      entry('pay_4', 'g_sat', 'p_arjun', 20000, 'payment', 'lifeos'),
    ],
    change_log: [{ id: 'c1', kind: 'dues', summary: 'Arjun paid ₹200 · Sat 17 Oct', rev: 6 }],
  },
  deleted: [],
};
