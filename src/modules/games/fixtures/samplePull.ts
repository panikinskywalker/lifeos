import type { TurfPull } from '../pull';

/**
 * A recorded pull, shaped like Turf Ledger's GET /api/lifeos (version 1):
 * names, numbers and UPI IDs are made up. Rutvij fronts the Sat game; Priya
 * fronts the Wed one. Used by the games tests and the board's empty-state
 * preview; replace with a real recording once the endpoint is live.
 */
export const samplePull: TurfPull = {
  format: 'turf-ledger-for-lifeos',
  version: 1,
  generatedAt: '2026-10-18T09:00:00.000Z',
  players: [
    { id: 'p_rutvij', name: 'Rutvij', phone: '+91 98200 00001', email: null, position: 'Midfielder', paymentId: 'rutvij@okicici', preferredFoot: 'Right', initialAbility: 72, pace: 4, stamina: 4, defending: 3, passing: 4, dribbling: 3, shooting: 3, publicSlug: 'rutvij-x1', availabilityMode: 'regular', weeklyAvailability: 'all_week', defaultAvailability: 'AVL', comfortablePositions: ['CM', 'RW'], availabilityPeriods: [] },
    { id: 'p_priya', name: 'Priya', phone: '98200 00002', email: 'priya@example.com', position: 'Defender', paymentId: 'priya.s@okaxis', goalkeeperWilling: true, goalkeeperRating: 6.5, publicSlug: 'priya-x2', defaultAvailability: 'AVL', availabilityPeriods: [] },
    { id: 'p_karan', name: 'Karan', phone: '+919820000003', position: 'Forward', paymentId: null, speciality: 'Finishing', defaultAvailability: 'INJ', availabilityPeriods: [{ status: 'INJ', startsAt: '2026-10-10', endsAt: '2026-10-24', note: 'Ankle' }] },
    { id: 'p_arjun', name: 'Arjun', phone: null, email: null, position: 'Goalkeeper', defaultAvailability: 'AVL', availabilityPeriods: [] },
  ],
  venues: [
    { id: 'v_play', name: 'Playground Arena', defaultTime: '20:00', sideSize: 6, defaultCost: 1800, mapsLink: 'https://maps.app.goo.gl/abc', paymentTerms: 'postpaid', advanceAmount: null, photoUrl: '/api/lifeos/photo/venue/v_play', notes: null },
    { id: 'v_dome', name: 'Dome Turf', defaultTime: '07:00', sideSize: 5, defaultCost: 1500, mapsLink: null, paymentTerms: 'advance_paid', advanceAmount: 500, photoUrl: null, notes: 'Bring bibs' },
  ],
  games: [
    {
      id: 'g_sat', date: '2026-10-17', time: '20:00', venue: 'Playground Arena', venueId: 'v_play', sideSize: 6, teamAColor: '#2f80ed', teamBColor: '#f05a45', teamAScore: 7, teamBScore: 5, goalDataQuality: 'complete', motmPlayerId: 'p_karan', frontedByPlayerId: 'p_rutvij', paymentTerms: 'postpaid', advanceAmount: null, publicSlug: 'sat-17', captainAPlayerId: 'p_rutvij', captainBPlayerId: 'p_priya', totalAmount: 1800, expectedPlayers: 4,
      participants: [
        { playerId: 'p_rutvij', shareAmount: 450, paid: true, team: 'A', fieldPosition: 'CM', goals: 2, assists: 1, saves: 0, playedGoalkeeper: false, attendanceStatus: 'confirmed' },
        { playerId: 'p_karan', shareAmount: 450, paid: false, team: 'A', fieldPosition: 'ST', goals: 4, assists: 0, saves: 0, playedGoalkeeper: false, attendanceStatus: 'confirmed' },
        { playerId: 'p_priya', shareAmount: 450, paid: true, team: 'B', fieldPosition: 'CB', goals: 1, assists: 2, saves: 0, playedGoalkeeper: false, attendanceStatus: 'late' },
        { playerId: 'p_arjun', shareAmount: 450, paid: false, team: 'B', fieldPosition: 'GK', goals: 0, assists: 0, saves: 9, playedGoalkeeper: true, attendanceStatus: 'confirmed' },
      ],
      rsvps: [{ playerId: 'p_karan', status: 'in', respondedAt: '2026-10-15T10:00:00Z', teamPreference: null }],
    },
    {
      id: 'g_wed', date: '2026-10-14', time: '07:00', venue: 'Dome Turf', venueId: 'v_dome', sideSize: 5, teamAScore: 3, teamBScore: 3, goalDataQuality: 'partial', motmPlayerId: null, frontedByPlayerId: 'p_priya', paymentTerms: 'advance_paid', advanceAmount: 500, publicSlug: 'wed-14', totalAmount: 1500, expectedPlayers: 3,
      participants: [
        { playerId: 'p_rutvij', shareAmount: 500, paid: false, team: 'A', goals: 1, assists: 0, saves: 0, playedGoalkeeper: false, attendanceStatus: 'confirmed' },
        { playerId: 'p_priya', shareAmount: 500, paid: true, team: 'B', goals: 2, assists: 0, saves: 0, playedGoalkeeper: false, attendanceStatus: 'confirmed' },
        { playerId: 'p_karan', shareAmount: 500, paid: false, team: 'A', goals: 2, assists: 1, saves: 0, playedGoalkeeper: false, attendanceStatus: 'confirmed' },
      ],
      rsvps: [],
    },
    {
      id: 'g_next', date: '2026-10-24', time: '20:00', venue: 'Playground Arena', venueId: 'v_play', sideSize: 6, teamAScore: null, teamBScore: null, goalDataQuality: 'missing', frontedByPlayerId: null, paymentTerms: 'tentative', totalAmount: 1800, expectedPlayers: 12,
      participants: [{ playerId: 'p_priya', shareAmount: 150, paid: false, team: null, goals: 0, assists: 0, saves: 0, playedGoalkeeper: false, attendanceStatus: 'confirmed' }],
      rsvps: [{ playerId: 'p_priya', status: 'in', respondedAt: '2026-10-18T08:00:00Z' }, { playerId: 'p_arjun', status: 'maybe', respondedAt: '2026-10-18T08:05:00Z' }],
    },
  ],
  paymentAudit: [],
  playerPositions: [],
  teamGenerations: [],
  transactions: [],
};
