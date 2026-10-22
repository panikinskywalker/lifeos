/**
 * The WhatsApp texts, copied from Turf web v0.0.61 (`lib/messages.ts`), so a
 * message reads the same from either phone. Keep in step when Turf web
 * changes it. Its original comment follows.
 */
// Every text that copy and share send, ready for WhatsApp: *bold* headings,
// emoji labels, one line per person, each due broken down by match. One
// builder for the site, the server and LifeOS, so a message reads the same
// from either phone. The layouts follow Turf Ledger's own (OUTSTANDING
// PAYMENTS, PAYMENT STATUS, MATCH DETAILS), with part payments, credits and
// the match's kits added.
import type { DuePerson } from "./dues";
import { kitOf, DEFAULT_KITS, type Kit } from "./kits";

/** Whole rupees, as Turf Ledger shows them (₹171.11 → ₹171); the amounts underneath stay exact. */
export function rupees(cents: number): string {
  const text = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(Math.abs(cents) / 100));
  return `${cents < 0 ? "−" : ""}₹${text}`;
}

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WD_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MO_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const at = (date: string) => new Date(`${date}T12:00:00Z`);

/** "5 Sep". */
export function dayMonth(date: string): string {
  const d = at(date);
  return `${d.getUTCDate()} ${MO[d.getUTCMonth()]}`;
}

export function shortDay(date: string): string {
  const d = at(date);
  return `${WD[d.getUTCDay()]} ${d.getUTCDate()} ${MO[d.getUTCMonth()]}`;
}

/** "Saturday, 5 September 2026". */
export function longDay(date: string): string {
  const d = at(date);
  return `${WD_LONG[d.getUTCDay()]}, ${d.getUTCDate()} ${MO_LONG[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "9:00 PM". */
export function clockText(time: string | null): string {
  if (!time || !/^\d{1,2}:\d{2}/.test(time)) return "Time not set";
  const [h, m] = time.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

const period = (time: string | null) => {
  if (!time) return null;
  const h = Number(time.split(":")[0]);
  return h < 12 ? "Morning" : h < 17 ? "Afternoon" : h < 21 ? "Evening" : "Night";
};

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;
const upiLine = (upi: string | null) => (upi ? [`💸 *UPI:* ${upi}`] : []);

/** What already went against a due: "₹29 credit used", "₹50 of ₹150 paid", or both. */
const alreadyIn = (g: { shareCents: number; paidCents: number; creditCents?: number }, short = false) => {
  const credit = Math.min(g.creditCents || 0, g.paidCents);
  const cash = g.paidCents - credit;
  const bits = [cash > 0 ? (short ? `${rupees(cash)} paid` : `${rupees(cash)} of ${rupees(g.shareCents)} paid`) : "", credit > 0 ? `${rupees(credit)} credit used` : ""].filter(Boolean);
  return bits.length ? ` _(${bits.join(" · ")})_` : "";
};

const KIT_EMOJI: Record<string, string> = {
  White: "⚪", Black: "⚫", Red: "🔴", Coral: "🔴", Maroon: "🟤", Blue: "🔵", Navy: "🔵", Sky: "🔵",
  Green: "🟢", Lime: "🟢", Mint: "🟢", Sun: "🟡", Orange: "🟠", Purple: "🟣", Lilac: "🟣", Pink: "🩷", Grey: "🩶",
};
export const kitEmoji = (kit: Kit) => KIT_EMOJI[kit.name] || "👕";
const kitLabel = (kit: Kit) => `${kitEmoji(kit)} ${kit.name}`;

// ---- Dues ----

export type Credit = { playerId: string; name: string; creditCents: number };

/** Every open due as one message, each person broken down by match, then credits ("Copy all"). */
export function allDuesText(people: DuePerson[], squadName: string, upi: string | null, credits: Credit[] = []): string {
  const owed = people.filter((p) => p.direction === "owes_you");
  const total = owed.reduce((sum, p) => sum + p.totalCents, 0);
  const lines: string[] = [];
  if (!owed.length) lines.push(`✅ *${squadName.toUpperCase()} — ALL DUES SETTLED*`, "", "Thanks, everyone! 🙌");
  else {
    lines.push("💰 *OUTSTANDING PAYMENTS*", "", `*Total due:* ${rupees(total)}`, `*People pending:* ${owed.length}`, "");
    owed.forEach((p, i) => {
      lines.push(`${i + 1}. *${p.name}* — *${rupees(p.totalCents)}*`);
      for (const g of [...p.games].sort((a, b) => b.date.localeCompare(a.date))) {
        lines.push(`   • ${longDay(g.date)} · ${g.venue} — ${rupees(g.balanceCents)}${alreadyIn(g)}`);
      }
    });
  }
  const held = credits.filter((c) => c.creditCents > 0).sort((a, b) => b.creditCents - a.creditCents || a.name.localeCompare(b.name));
  if (held.length) {
    lines.push("", "*AVAILABLE CREDIT*", `*Total credit:* +${rupees(held.reduce((s, c) => s + c.creditCents, 0))}`);
    held.forEach((c, i) => lines.push(`${i + 1}. *${c.name}* — *+${rupees(c.creditCents)} credit*`));
    lines.push("Credit will automatically reduce their next game's dues.");
  }
  if (owed.length && upi) lines.push("", ...upiLine(upi));
  return lines.join("\n");
}

/** Copy short: each person's total and the matches behind it, one line each. */
export function allDuesShortText(people: DuePerson[], squadName: string, upi: string | null, credits: Credit[] = []): string {
  const owed = people.filter((p) => p.direction === "owes_you");
  if (!owed.length) return `✅ *${squadName.toUpperCase()}* — all dues settled 🙌`;
  const total = owed.reduce((sum, p) => sum + p.totalCents, 0);
  const held = credits.filter((c) => c.creditCents > 0);
  return [
    `💰 *DUES* — *${rupees(total)}* · ${owed.length} ${owed.length === 1 ? "person" : "people"}`,
    "",
    ...owed.map((p, i) => `${i + 1}. *${p.name}* — ${rupees(p.totalCents)} (${[...p.games].sort((a, b) => a.date.localeCompare(b.date)).map((g) => dayMonth(g.date)).join(", ")})`),
    ...(held.length ? ["", `💳 Credit held: +${rupees(held.reduce((sum, c) => sum + c.creditCents, 0))} · ${held.length} ${held.length === 1 ? "person" : "people"}`] : []),
    ...(upi ? ["", ...upiLine(upi)] : []),
  ].join("\n");
}

/** One person's reminder, broken down by match. */
export function reminderText(person: Pick<DuePerson, "name" | "totalCents" | "games">, upi: string | null): string {
  const games = [...person.games].sort((a, b) => b.date.localeCompare(a.date));
  return [
    `💰 *${person.name.toUpperCase()} — PAYMENT DUE*`,
    "",
    `Hi ${firstName(person.name)} 👋`,
    `*Total due:* ${rupees(person.totalCents)}`,
    `*Unpaid games:* ${games.length}`,
    "",
    ...games.map((g, i) => `${i + 1}. *${g.venue}*\n   📅 ${longDay(g.date)} — *${rupees(g.balanceCents)}*${alreadyIn(g, true)}`),
    ...(upi ? ["", ...upiLine(upi)] : []),
    "Thanks! 🙏",
  ].join("\n");
}

// ---- A match ----

export type SummaryGame = { venue: string; date: string; time?: string | null; sideSize: number | null; paymentTerms: string; totalCents: number; mapsLink?: string | null };
export type SummaryShare = { name: string; shareCents: number; paidCents: number; fronted: boolean };

const header = (game: { venue: string; date: string; time?: string | null; mapsLink?: string | null }) => [
  `📍 *Venue:* ${game.venue}`,
  ...(game.mapsLink ? [`🗺️ *Google Maps:* ${game.mapsLink}`] : []),
  `📅 *Date:* ${longDay(game.date)}`,
  `🕘 *Time:* ${game.time ? `${period(game.time)} · ${clockText(game.time)}` : "Time not set"}`,
];

/** The match's PAYMENT STATUS: who's paid, part-paid, pending, holding credit; your UPI. */
export function summaryText(game: SummaryGame, shares: SummaryShare[], upi: string | null): string {
  const tentative = game.paymentTerms === "tentative";
  const equal = shares.length > 0 && shares.every((s) => s.shareCents === shares[0].shareCents);
  const paid = shares.filter((s) => s.fronted || s.paidCents >= s.shareCents);
  const pending = tentative ? [] : shares.filter((s) => !s.fronted && s.paidCents < s.shareCents);
  const collected = shares.reduce((sum, s) => sum + (s.fronted ? s.shareCents : Math.min(s.shareCents, Math.max(0, s.paidCents))), 0);
  const outstanding = pending.reduce((sum, s) => sum + s.shareCents - s.paidCents, 0);
  const line = (s: SummaryShare, i: number) => {
    const n = `${i + 1}. *${s.name}*`;
    if (s.fronted) return `💳 ${n} — Paid the venue ${rupees(game.totalCents)}`;
    if (tentative) return `○ ${n} — Not due yet`;
    if (s.paidCents > s.shareCents) return `✅ ${n} — Paid · +${rupees(s.paidCents - s.shareCents)} credit`;
    if (s.paidCents >= s.shareCents) return `✅ ${n} — Paid`;
    if (s.paidCents > 0) return `◐ ${n} — ${rupees(s.paidCents)} paid · *${rupees(s.shareCents - s.paidCents)} pending*`;
    return `⏳ ${n} — Pending *${rupees(s.shareCents)}*`;
  };
  return [
    `💳 *${game.venue.toUpperCase()} — PAYMENT STATUS*`,
    "",
    ...header(game),
    `👥 *Players:* ${shares.length}`,
    `💰 *Cost:* ${rupees(game.totalCents)}${equal ? ` ÷ ${shares.length} = *${rupees(shares[0].shareCents)} each*` : ""}`,
    ...(tentative ? ["ℹ️ *Ledger:* Tentative — no player dues yet"] : [
      `✅ *Paid:* ${paid.length} · ${rupees(collected)} collected`,
      `⏳ *Pending:* ${pending.length} · ${rupees(outstanding)}`,
    ]),
    "",
    ...shares.map(line),
    ...(!tentative && !pending.length ? ["", "All paid. Thanks, everyone! 🙌"] : []),
    ...(!tentative && pending.length && upi ? ["", ...upiLine(upi)] : []),
  ].join("\n");
}

/** Copy short for a match: cost, how many paid, who's pending. */
export function summaryShortText(game: SummaryGame, shares: SummaryShare[], upi: string | null): string {
  const tentative = game.paymentTerms === "tentative";
  const equal = shares.length > 0 && shares.every((s) => s.shareCents === shares[0].shareCents);
  const paid = shares.filter((s) => s.fronted || s.paidCents >= s.shareCents).length;
  const pending = shares.filter((s) => !s.fronted && s.paidCents < s.shareCents);
  return [
    `💳 *${game.venue}* · ${shortDay(game.date)}`,
    `${rupees(game.totalCents)}${equal ? ` ÷ ${shares.length} = *${rupees(shares[0].shareCents)} each*` : ""}${tentative ? "" : ` · ${paid} of ${shares.length} paid`}`,
    tentative ? "ℹ️ Tentative — no dues yet" : pending.length ? `⏳ Pending: ${pending.map((s) => `${firstName(s.name)} ${rupees(s.shareCents - s.paidCents)}`).join(", ")}` : "✅ All paid 🙌",
    ...(!tentative && pending.length && upi ? upiLine(upi) : []),
  ].join("\n");
}

/** A nudge for the group: who still owes for this match, and how much. */
export function pendingText(game: SummaryGame, shares: SummaryShare[], upi: string | null): string {
  const pending = shares.filter((s) => !s.fronted && s.paidCents < s.shareCents);
  return [
    `⏳ *${game.venue.toUpperCase()} — PAYMENT PENDING*`,
    `📅 ${longDay(game.date)}`,
    "",
    `*Pending:* ${pending.length} · ${rupees(pending.reduce((sum, s) => sum + s.shareCents - s.paidCents, 0))}`,
    "",
    ...pending.map((s, i) => `${i + 1}. *${s.name}* — *${rupees(s.shareCents - s.paidCents)}*${s.paidCents > 0 ? ` _(${rupees(s.paidCents)} paid)_` : ""}`),
    ...(upi ? ["", ...upiLine(upi)] : []),
    "Thanks! 🙏",
  ].join("\n");
}

export type MatchTextGame = {
  venue: string; date: string; time: string | null; sideSize: number | null; expectedPlayers: number; totalAmount: number; mapsLink?: string | null;
  teamAColor: string | null; teamBColor: string | null; teamAScore: number | null; teamBScore: number | null; motmPlayerId?: string | null;
  formationA?: string | null; formationB?: string | null; captainAPlayerId?: string | null; captainBPlayerId?: string | null;
  participants: Array<{ playerId: string; playerName: string; team: string | null; fieldPosition?: string | null; goals: number; assists: number; saves: number; ownGoals?: number; attendanceStatus?: string }>;
};

const kitsOf = (g: Pick<MatchTextGame, "teamAColor" | "teamBColor">) => ({ A: kitOf(g.teamAColor, DEFAULT_KITS.A), B: kitOf(g.teamBColor, DEFAULT_KITS.B) });

/** MATCH DETAILS: where and when, then the teams (or the list so far) with goals, assists, saves. */
export function matchDetailsText(game: MatchTextGame): string {
  const k = kitsOf(game);
  const playing = game.participants.filter((p) => p.attendanceStatus !== "no_show");
  const side = (t: "A" | "B") => playing.filter((p) => p.team === t);
  const rest = playing.filter((p) => p.team !== "A" && p.team !== "B");
  const lines = (people: MatchTextGame["participants"], captain?: string | null) => people.length ? people.map((p, i) => {
    const stats = [p.goals ? `${p.goals} ${p.goals === 1 ? "goal" : "goals"}` : "", p.assists ? `${p.assists} ${p.assists === 1 ? "assist" : "assists"}` : "", p.saves ? `${p.saves} ${p.saves === 1 ? "save" : "saves"}` : ""].filter(Boolean);
    return `${i + 1}. ${p.playerName}${p.playerId === captain ? " (C)" : ""}${stats.length ? ` — ${stats.join(" · ")}` : ""}`;
  }).join("\n") : "No players yet";
  const spotsLeft = Math.max(0, game.expectedPlayers - playing.length);
  const scored = game.teamAScore !== null && game.teamBScore !== null;
  const picked = side("A").length + side("B").length > 0;
  return [
    `⚽ *${game.venue.toUpperCase()} — MATCH DETAILS*`,
    "",
    ...header(game),
    `🎮 *Game:* ${game.sideSize ? `${game.sideSize}-a-side football` : "Football match"}`,
    `👕 *Kits:* ${kitLabel(k.A)} v ${kitLabel(k.B)}`,
    `👥 *Total players:* ${playing.length}`,
    spotsLeft > 0 ? `🪑 *Spots left:* ${spotsLeft}` : `💸 *Per person:* ${rupees(Math.round((game.totalAmount * 100) / Math.max(1, playing.length)))}`,
    ...(scored ? [`🏁 *Score:* ${k.A.name} ${game.teamAScore}–${game.teamBScore} ${k.B.name}`] : []),
    ...(picked ? [
      "", `*${kitLabel(k.A).toUpperCase()}* · ${side("A").length} ${side("A").length === 1 ? "player" : "players"}${game.formationA ? ` · ${game.formationA}` : ""}`, lines(side("A"), game.captainAPlayerId),
      "", `*${kitLabel(k.B).toUpperCase()}* · ${side("B").length} ${side("B").length === 1 ? "player" : "players"}${game.formationB ? ` · ${game.formationB}` : ""}`, lines(side("B"), game.captainBPlayerId),
      ...(rest.length ? ["", `*UNASSIGNED* · ${rest.length}`, lines(rest)] : []),
    ] : ["", `*CURRENT LIST* · ${playing.length} ${playing.length === 1 ? "player" : "players"}`, lines(playing)]),
  ].join("\n");
}

/** The RSVP invite for an upcoming match. */
export function rsvpText(game: MatchTextGame, link: string): string {
  const playing = game.participants.filter((p) => p.attendanceStatus !== "no_show");
  const spotsLeft = Math.max(0, game.expectedPlayers - playing.length);
  const k = kitsOf(game);
  return [
    `⚽ *MATCHDAY — ${shortDay(game.date).toUpperCase()}*`,
    "",
    ...header(game),
    `🎮 *Game:* ${game.sideSize ? `${game.sideSize}-a-side football` : "Football match"} · ${kitLabel(k.A)} v ${kitLabel(k.B)}`,
    `👥 *In so far:* ${playing.length} of ${game.expectedPlayers}${spotsLeft ? ` · ${spotsLeft} ${spotsLeft === 1 ? "spot" : "spots"} left` : " · full"}`,
    ...(game.totalAmount ? [`💸 *Per person:* about ${rupees(Math.round((game.totalAmount * 100) / Math.max(1, game.expectedPlayers)))}`] : []),
    "",
    "👉 *Are you in?* Tap to answer:",
    link,
  ].join("\n");
}

/** FULL TIME: the score in the kits, scorers per side, player of the match. */
export function resultText(game: MatchTextGame, link?: string): string {
  const k = kitsOf(game);
  const scorers = (t: "A" | "B") => {
    const own = game.participants.filter((p) => p.team === t && p.goals > 0).map((p) => (p.goals > 1 ? `${p.playerName} ×${p.goals}` : p.playerName));
    const og = game.participants.filter((p) => p.team !== t && p.team && (p.ownGoals || 0) > 0).reduce((s, p) => s + (p.ownGoals || 0), 0);
    if (og) own.push(og > 1 ? `own goal ×${og}` : "own goal");
    return own.join(", ") || "—";
  };
  const motm = game.participants.find((p) => p.playerId === game.motmPlayerId);
  const scored = game.teamAScore !== null && game.teamBScore !== null;
  return [
    `🏁 *${scored ? "FULL TIME" : "MATCH"} — ${game.venue.toUpperCase()}*`,
    `📅 ${longDay(game.date)}`,
    "",
    scored ? `${kitEmoji(k.A)} *${k.A.name} ${game.teamAScore} – ${game.teamBScore} ${k.B.name}* ${kitEmoji(k.B)}` : `${kitLabel(k.A)} v ${kitLabel(k.B)} · no score yet`,
    ...(scored ? ["", `⚽ *${k.A.name}:* ${scorers("A")}`, `⚽ *${k.B.name}:* ${scorers("B")}`] : []),
    ...(motm ? [`🏆 *Player of the match:* ${motm.playerName}`] : []),
    ...(link ? ["", `📊 Full match: ${link}`] : []),
  ].join("\n");
}

// ---- Leaders and players ----

/** A leaderboard: medals for the top three, then numbers. */
export function leaderboardText(title: string, note: string, rows: Array<{ name: string; value: string }>): string {
  const medal = ["🥇", "🥈", "🥉"];
  return [
    `🏆 *${title.toUpperCase()}*`,
    `_${note}_`,
    "",
    ...rows.map((r, i) => (i < 3 ? `${medal[i]} *${r.name}* — *${r.value}*` : `${i + 1}. ${r.name} — ${r.value}`)),
  ].join("\n");
}

export type CardTotals = { apps: number; goals: number; assists: number; saves: number; wins: number; draws: number; losses: number; potm: number };

/** A player's stats card. */
export function statsCardText(player: { name: string; position: string | null; jerseyNumber: string | null }, t: CardTotals, link?: string): string {
  const decided = t.wins + t.draws + t.losses;
  return [
    `⚽ *${player.name.toUpperCase()}*${player.jerseyNumber ? ` · #${player.jerseyNumber}` : ""}${player.position ? ` · ${player.position}` : ""}`,
    "",
    `🎮 *Apps:* ${t.apps}`,
    `⚽ *Goals:* ${t.goals} · 🅰️ *Assists:* ${t.assists}`,
    ...(t.saves ? [`🧤 *Saves:* ${t.saves}`] : []),
    `🏆 *Record:* ${t.wins}W · ${t.draws}D · ${t.losses}L${decided ? ` (${Math.round((t.wins / decided) * 100)}% wins)` : ""}`,
    ...(t.potm ? [`⭐ *Player of the match:* ${t.potm}×`] : []),
    ...(link ? ["", `👤 ${link}`] : []),
  ].join("\n");
}

// ---- Links ----

export const privateLinkText = (name: string, link: string) => [
  `👋 Hi *${firstName(name)}*!`,
  "Here's your own Turf page — answer RSVPs, see your stats and what you owe:",
  link,
  "",
  "🔒 _This link is just for you — please don't forward it._",
].join("\n");

export const setupLinkText = (name: string, username: string, link: string, valid = "72 hours") => [
  `👋 Hi *${firstName(name)}*!`,
  "Your Turf sign-in is ready.",
  "",
  `👤 *Username:* ${username}`,
  `🔑 *Set your password* (works once, for ${valid}):`,
  link,
  "",
  "_Then sign in with your username and password: your matches, RSVPs, dues, availability and stats._",
].join("\n");

export const profileInviteText = (name: string, link: string) => [
  `👋 Hi *${firstName(name)}*!`,
  "Fill in your Turf profile — photo, positions, UPI — it takes a minute:",
  link,
  "",
  "_I'll approve it and it goes on the squad._",
].join("\n");

export const squadInviteText = (squad: string, link: string) => [
  `⚽ *JOIN ${squad.toUpperCase()}*`,
  "",
  "Fill in your profile here and you're on the squad list:",
  link,
].join("\n");

export const viewerLinkText = (squad: string, link: string) => [
  `⚽ *${squad.toUpperCase()} — SQUAD VIEWER*`,
  "",
  "View-only: fixtures, results, line-ups, player profiles and leaderboards.",
  link,
].join("\n");

export const publicProfileText = (name: string, link: string) => `⚽ *${name}* on Turf — stats and profile:\n${link}`;
