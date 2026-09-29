// Chain configuration. chainId -> { name, rpcs, explorer, ... }
//
// To use a paid / private endpoint, put it in RPC_OVERRIDES. Override URLs are tried
// first, then the public list below is kept as fallback. Example:
//   export const RPC_OVERRIDES = { 1: ['https://eth-mainnet.g.alchemy.com/v2/<KEY>'] };
// Note: this is a static site, so any key placed here is visible to every visitor.
// Use a domain-restricted key.
export const RPC_OVERRIDES = {};

// Etherscan-family explorers: "Write Contract" lives at /address/<addr>#writeContract,
// proxies at #writeProxyContract.
// batchSize: max JSON-RPC batch size accepted by the first public RPC (drpc free = 3).
// multicall: Multicall3 address (null = don't try; falls back to JSON-RPC batch).
const MC3 = '0xcA11bde05977b3631167028862bE2a173976CA11';

export const CHAINS = {
  1: {
    name: 'Ethereum', native: 'ETH', llama: 'ethereum',
    rpcs: ['https://eth.drpc.org', 'https://ethereum-rpc.publicnode.com'],
    explorer: 'https://etherscan.io', explorerName: 'Etherscan',
  },
  137: {
    name: 'Polygon PoS', native: 'POL', llama: 'polygon',
    rpcs: ['https://polygon.drpc.org', 'https://polygon-bor-rpc.publicnode.com'],
    explorer: 'https://polygonscan.com', explorerName: 'PolygonScan',
  },
  42161: {
    name: 'Arbitrum One', native: 'ETH', llama: 'arbitrum',
    rpcs: ['https://arbitrum.drpc.org', 'https://arbitrum-one-rpc.publicnode.com'],
    explorer: 'https://arbiscan.io', explorerName: 'Arbiscan',
  },
  10: {
    name: 'OP Mainnet', native: 'ETH', llama: 'optimism',
    rpcs: ['https://optimism.drpc.org', 'https://optimism-rpc.publicnode.com'],
    explorer: 'https://optimistic.etherscan.io', explorerName: 'Optimistic Etherscan',
  },
  8453: {
    name: 'Base', native: 'ETH', llama: 'base',
    rpcs: ['https://base.drpc.org', 'https://base-rpc.publicnode.com'],
    explorer: 'https://basescan.org', explorerName: 'BaseScan',
  },
  56: {
    name: 'BNB Chain', native: 'BNB', llama: 'bsc',
    rpcs: ['https://bsc.drpc.org', 'https://bsc-dataseed.bnbchain.org', 'https://bsc-rpc.publicnode.com'],
    explorer: 'https://bscscan.com', explorerName: 'BscScan',
  },
  43114: {
    name: 'Avalanche C-Chain', native: 'AVAX', llama: 'avax',
    rpcs: ['https://avalanche.drpc.org', 'https://avalanche-c-chain-rpc.publicnode.com', 'https://api.avax.network/ext/bc/C/rpc'],
    explorer: 'https://snowscan.xyz', explorerName: 'SnowScan',
  },
  100: {
    name: 'Gnosis', native: 'xDAI', llama: 'xdai',
    rpcs: ['https://gnosis.drpc.org', 'https://gnosis-rpc.publicnode.com'],
    explorer: 'https://gnosisscan.io', explorerName: 'GnosisScan',
  },
  324: {
    name: 'zkSync Era', native: 'ETH', llama: 'era',
    rpcs: ['https://zksync.drpc.org', 'https://mainnet.era.zksync.io'],
    explorer: 'https://era.zksync.network', explorerName: 'zkSync Era Explorer',
    // zkSync Era has its own Multicall3 deployment (different bytecode hash rules)
    multicall: '0xF9cda624FBC7e059355ce98a31693d299FACd963',
  },
  59144: {
    name: 'Linea', native: 'ETH', llama: 'linea',
    rpcs: ['https://linea.drpc.org', 'https://linea-rpc.publicnode.com'],
    explorer: 'https://lineascan.build', explorerName: 'LineaScan',
  },
  534352: {
    name: 'Scroll', native: 'ETH', llama: 'scroll',
    rpcs: ['https://scroll.drpc.org', 'https://scroll-rpc.publicnode.com', 'https://rpc.scroll.io'],
    explorer: 'https://scrollscan.com', explorerName: 'ScrollScan',
  },
  5000: {
    name: 'Mantle', native: 'MNT', llama: 'mantle',
    rpcs: ['https://mantle.drpc.org', 'https://mantle-rpc.publicnode.com'],
    explorer: 'https://mantlescan.xyz', explorerName: 'MantleScan',
  },
  146: {
    name: 'Sonic', native: 'S', llama: 'sonic',
    rpcs: ['https://sonic.drpc.org', 'https://sonic-rpc.publicnode.com'],
    explorer: 'https://sonicscan.org', explorerName: 'SonicScan',
  },
  250: {
    name: 'Fantom Opera', native: 'FTM', llama: 'fantom',
    rpcs: ['https://fantom.drpc.org', 'https://rpcapi.fantom.network'],
    explorer: 'https://ftmscan.com', explorerName: 'FTMScan',
  },
};

for (const c of Object.values(CHAINS)) {
  if (c.multicall === undefined) c.multicall = MC3;
  if (c.batchSize === undefined) c.batchSize = 3;
}

export function getChain(chainId) {
  return CHAINS[chainId] || null;
}

/** RPC list for a chain: overrides first, then public fallbacks (deduplicated). */
export function rpcsFor(chainId) {
  const c = CHAINS[chainId];
  const over = RPC_OVERRIDES[chainId];
  const list = [...(Array.isArray(over) ? over : over ? [over] : []), ...(c ? c.rpcs : [])];
  return [...new Set(list)];
}

export function explorerAddressUrl(chainId, address, anchor = '') {
  const c = CHAINS[chainId];
  return c ? `${c.explorer}/address/${address}${anchor}` : null;
}
