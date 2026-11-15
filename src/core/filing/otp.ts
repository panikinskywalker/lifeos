/** "Never share your OTP" at the end of a payment text doesn't make it an OTP. */
const NOT_SHARING = /\b(?:never|do not|don'?t|pls do not|please do not)\s+(?:share|disclose)\b[^.\n]*/gi;
/** One-time codes and secrets in their many wordings ("is your Instagram code", "Delivery Code is", "Share DAC", "Password is"). */
const OTP_WORDS = /\b(otp|one[- ]time (?:password|pin|code)|verification code|security code|login code|passcode|auth(?:entication)? code|confirmation code|delivery code|DAC|password is|is your [\w ]{0,24}code|code is \d|use this code|code for (?:device|login|registration|sign))\b/i;

/** A text that carries a one-time code or a secret: never kept as a sample, its wording cleared after a week. */
export function isOtpText(body: string): boolean {
  return OTP_WORDS.test(body.replace(NOT_SHARING, ''));
}
