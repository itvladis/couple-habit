import { encodeDeepLink, resolveLanguage, type InviteLink, type RequestOutcome, type User } from '@habit/core';

/** The current user as the Mini App sees it; internal bookkeeping fields stay on the server. */
export function toMe(user: User) {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    username: user.username,
    photoUrl: user.photoUrl,
    language: resolveLanguage(user),
    languageSetting: user.language,
    theme: user.theme,
    timeZone: user.timeZone,
    timeZoneManual: user.timeZoneManual,
    remindersEnabled: user.remindersEnabled,
    weeklySummary: user.weeklySummary,
  };
}

export function toInviteLink(link: InviteLink, botUsername: string) {
  return {
    token: link.token,
    habitId: link.habitId,
    // Opens the Mini App straight on the invite screen (needs the bot's Main Mini App set in @BotFather).
    url: `https://t.me/${botUsername}?startapp=${encodeDeepLink({ screen: 'invite', token: link.token })}`,
  };
}

/** What the Mini App needs to show after opening an invite; the internal request record stays private. */
export function toInviteOutcome(outcome: RequestOutcome) {
  if (!('approver' in outcome)) return outcome;
  // The joiner is not a friend yet: show the approver's name, not their Telegram id.
  const approver = { firstName: outcome.approver.firstName };
  if (outcome.status !== 'requested') return { ...outcome, approver };
  const { request, ...rest } = outcome;
  return { ...rest, approver, requestId: request.id };
}
