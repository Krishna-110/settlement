// Single source of truth for every user-facing link the app hands out.

// Where to send someone who doesn't have the app yet (shown in SMS/WhatsApp invites).
// TODO: point this at the Play Store / App Store listing once the app is published.
export const APP_WEBSITE = 'https://gaurav-tekkie.github.io/Settlement.github.io/';

// Deep link that opens the app straight into joining a group.
// "settlement" is declared alongside "cleardues" in app.json's scheme array: the OAuth redirect
// still uses cleardues:// (renaming it would break login), while invites use the branded one.
export const joinGroupLink = (joinCode) => `settlement://join?code=${joinCode}`;

// Free QR renderer - encodes whatever string it's given.
export const qrImageUrl = (data) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=${encodeURIComponent(data)}`;
