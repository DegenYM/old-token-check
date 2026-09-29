// Site configuration.
//
// TIP_ADDRESS: the wallet that receives tips. Leave it empty until you have set it to an
// address you control; while empty, the tip jar shows a "not set up yet" state instead of
// an address, so nobody can send tips to a placeholder.
export const TIP_ADDRESS = '0x17D70f1Bd8900f7253283f5eb9f1832DEc888888';

// Optional ENS name that resolves to TIP_ADDRESS, shown next to it (e.g. 'oldtokencheck.eth').
export const TIP_ENS = '';

// Networks the tip jar says it accepts. The same EVM address works on all of them.
export const TIP_CHAINS = ['Ethereum', 'Arbitrum', 'Base', 'OP Mainnet', 'Polygon', 'BNB Chain', 'Avalanche', 'Gnosis'];

// USD prices for results. Public, key-free, CORS-enabled. Set to '' to hide USD values.
export const PRICE_API = 'https://coins.llama.fi/prices/current/';
