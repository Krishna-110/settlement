// Single source of truth for every user-facing link the app hands out.

// Where to send someone who doesn't have the app yet (shown in SMS/WhatsApp invites).
// The branded domain rather than the raw GitHub Pages URL it serves: this lands in strangers'
// messaging apps, and "gaurav-tekkie.github.io/Settlement.github.io" reads like a phishing link
// next to "settleyourdues.com". Same site either way.
// TODO: swap for https://play.google.com/store/apps/details?id=com.cleardues once the listing is
// live - a Play link beats a sideloaded APK for both trust and install rate.
export const APP_WEBSITE = 'https://settleyourdues.com/';

// Invite link for a group. This is an https:// URL rather than the settlement:// deep link,
// because WhatsApp and SMS only turn http(s) into something tappable - a custom scheme renders
// as plain grey text that does nothing. The page at /join.html hands off to the app via
// settlement://join?code=..., and shows the code plus a download link if the app isn't installed.
// "settlement" is declared alongside "cleardues" in app.json's scheme array: the OAuth redirect
// still uses cleardues:// (renaming it would break login), while invites use the branded one.
export const joinGroupLink = (joinCode) => `https://settleyourdues.com/join.html?code=${joinCode}`;

// Free QR renderer - encodes whatever string it's given.
export const qrImageUrl = (data) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=${encodeURIComponent(data)}`;
