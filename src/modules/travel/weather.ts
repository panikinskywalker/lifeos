/**
 * Weather by stop (the trip template, JP-Parts 07): the month's normals for a
 * stop, from a small table of places, until live weather is chosen (*Not in
 * R7g*: live weather). Highs and lows in °C; the sky is the month's usual.
 */

export type Sky = 'sun' | 'cloud' | 'snow' | 'rain';
export interface Normals {
  hi: number;
  lo: number;
  sky: Sky;
}

// [match, Dec hi, Dec lo, Dec sky, Jan hi, Jan lo, Jan sky]
const TABLE: Array<[RegExp, number, number, Sky, number, number, Sky]> = [
  [/tokyo|ryogoku|shinjuku|asakusa|haneda|narita|東京/i, 12, 4, 'sun', 10, 1, 'sun'],
  [/kawaguchi|河口湖/i, 8, -3, 'sun', 6, -5, 'sun'],
  [/fujiyoshida|富士吉田/i, 8, -3, 'sun', 6, -5, 'sun'],
  [/suzaka|nagano|yudanaka|jigokudani|須坂|長野/i, 6, -3, 'snow', 3, -5, 'snow'],
  [/magome|tsumago|nakatsugawa|kiso|馬籠|妻籠/i, 8, -2, 'snow', 6, -4, 'snow'],
  [/takayama|shirakawa|高山/i, 5, -4, 'snow', 3, -6, 'snow'],
  [/kyoto|京都/i, 12, 3, 'cloud', 9, 1, 'cloud'],
  [/osaka|rinku|izumisano|kansai|kix|大阪|りんくう/i, 12, 4, 'sun', 10, 2, 'sun'],
  [/nara|奈良/i, 11, 1, 'cloud', 9, -1, 'cloud'],
  [/ise|伊勢/i, 12, 2, 'sun', 10, 0, 'sun'],
  [/shingu|kumano|nachi|kii|新宮|熊野/i, 14, 4, 'sun', 12, 2, 'sun'],
  [/kura|鞍|蔵/i, 10, 1, 'cloud', 8, -1, 'cloud'],
  [/hakone|箱根/i, 9, 0, 'sun', 7, -2, 'sun'],
  [/nikko|日光/i, 7, -3, 'sun', 5, -5, 'snow'],
  [/nagoya|名古屋/i, 11, 2, 'sun', 9, 0, 'sun'],
  [/kanazawa|金沢/i, 10, 3, 'rain', 7, 1, 'snow'],
  [/hiroshima|miyajima|広島/i, 12, 3, 'sun', 10, 1, 'sun'],
  [/sapporo|hokkaido|niseko|札幌/i, 1, -5, 'snow', -1, -7, 'snow'],
  [/fukuoka|福岡/i, 13, 5, 'cloud', 10, 3, 'cloud'],
  [/okinawa|naha|那覇/i, 21, 16, 'cloud', 19, 14, 'cloud'],
];

/** The normals for a place in a month (1 to 12), or null when the table has no such place or month. */
export function normalsFor(place: string, month: number): Normals | null {
  const row = TABLE.find(([re]) => re.test(place));
  if (!row) return null;
  if (month === 12 || month === 11) return { hi: row[1], lo: row[2], sky: row[3] };
  if (month === 1 || month === 2) return { hi: row[4], lo: row[5], sky: row[6] };
  return null;
}
