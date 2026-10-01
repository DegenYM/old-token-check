// Site configuration.
//
// TIP_ADDRESS: the wallet that receives tips. Leave it empty until you have set it to an
// address you control; while empty, the tip jar shows a "not set up yet" state instead of
// an address, so nobody can send tips to a placeholder.
export const TIP_ADDRESS = '0x17D70f1Bd8900f7253283f5eb9f1832DEc888888';

// Optional ENS name that resolves to TIP_ADDRESS, shown next to it (e.g. 'oldtokencheck.eth').
export const TIP_ENS = '';

// USD prices for results. Public, key-free, CORS-enabled. Set to '' to hide USD values.
export const PRICE_API = 'https://coins.llama.fi/prices/current/';

// Alchemy API key, used only to list a wallet's past withdrawals from L2s (Polygon PoS), which
// public RPCs can't search through. Keep it out of git: put ALCHEMY_API=<key> in .env and
// tools/build.sh writes it into dist/config.js. Restrict the key to this site's domains in the
// Alchemy dashboard. Empty = the withdrawal check is skipped.
export const ALCHEMY_KEY = '';
