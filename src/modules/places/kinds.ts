/** Kind guesses from a name or sentence (filing: dumps, calendar, mail). Undefined when nothing says. */

const PLACE_WORDS: Array<[RegExp, string]> = [
  [/\b(airport|terminal|railway station|station|junction|metro|bus stand)\b/i, 'airport'],
  [/\b(hotel|resort|hostel|homestay|villa|airbnb|inn|lodge|suites?|stay)\b/i, 'stay'],
  [/\b(gym|fitness|cult\.?fit|crossfit|yoga|studio)\b/i, 'gym'],
  [/\b(turf|arena|stadium|ground|futsal|court|hall|auditorium|venue)\b/i, 'venue'],
  [/\b(restaurant|caf[eé]|coffee|bar|pub|brewery|brewpub|bistro|kitchen|dhaba|diner|bakery|eatery|taproom|dinner|lunch|brunch|breakfast|drinks|beers)\b/i, 'restaurant'],
  [/\b(mall|market|store|shop|mart|supermarket|showroom)\b/i, 'shop'],
  [/\b(office|campus|hq|headquarters|cowork\w*|wework)\b/i, 'work'],
  [/\b(home|my place|flat|apartment)\b/i, 'home'],
  [/(nagar|layout|halli|pura)\b|\b(block|sector|colony|stage|phase|road|street|lane)\b/i, 'area'],
  [/\b(city|town|village)\b/i, 'city'],
  [/\b(country)\b/i, 'country'],
];

const ORG_WORDS: Array<[RegExp, string]> = [
  [/\b(bank|card|credit|securities|broking|broker|capital|finance|mutual fund|amc|zerodha|groww)\b/i, 'bank'],
  [/\b(airlines?|airways|indigo|vistara|akasa|makemytrip|goibibo|cleartrip|irctc|uber|ola|rapido|travels?)\b/i, 'airline'],
  [/\b(restaurant|caf[eé]|kitchen|foods?|swiggy|zomato|dominos|pizza|burger|brew\w*|bakery)\b/i, 'restaurant'],
  [/\b(school|college|university|institute|academy|iit|iim)\b/i, 'school'],
  [/\b(gym|club|fitness|cult\.?fit|sports)\b/i, 'club'],
  [/\b(jio|airtel|vodafone|vi|bsnl|electricity|bescom|water board|gas|insurance|insurer|broadband|act fibernet|netflix|spotify|hotstar|prime|google|apple|microsoft)\b/i, 'service'],
  [/\b(store|stores|mart|shop|retail|amazon|flipkart|myntra|ikea|decathlon|nykaa|brand)\b/i, 'shop'],
  [/\b(pvt|ltd|limited|llp|inc|corp|technologies|labs|solutions|software|systems)\b/i, 'company'],
];

export function placeKindFor(text: string): string | undefined {
  return PLACE_WORDS.find(([re]) => re.test(text))?.[1];
}

export function orgKindFor(text: string): string | undefined {
  return ORG_WORDS.find(([re]) => re.test(text))?.[1];
}
