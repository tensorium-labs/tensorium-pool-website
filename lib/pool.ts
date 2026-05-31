export type PoolStats = {
  blocks_found: number;
  total_gross_atoms: number;
  total_fee_atoms: number;
  total_pending_net_atoms: number;
};

export type PayoutEntry = {
  block_height: number;
  block_hash: string;
  miner_address: string;
  gross_reward_atoms: number;
  pool_fee_atoms: number;
  net_payout_atoms: number;
  paid_out: boolean;
};

export type MinerPending = {
  miner_address: string;
  pending_net_atoms: number;
};

export type PoolSnapshot = {
  ok: boolean;
  generatedAt: string;
  poolApiUrl: string;
  stats: PoolStats;
  payouts: PayoutEntry[];
  error?: string;
};

export const POOL_FEE_BPS = 500;
export const POOL_FEE_PERCENT = POOL_FEE_BPS / 100;
export const POOL_TREASURY_ADDRESS =
  "txm10wa2dazhn2yqwwxkm4aegvzjq55hj9m2jlznt9";

const EMPTY_STATS: PoolStats = {
  blocks_found: 0,
  total_gross_atoms: 0,
  total_fee_atoms: 0,
  total_pending_net_atoms: 0
};

export function getPoolApiUrl() {
  return process.env.TENSORIUM_POOL_API_URL ?? "http://127.0.0.1:23336";
}

export function atomsToTxm(value: number) {
  return value / 100_000_000;
}

export function formatTxm(value: number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 8
  }).format(atomsToTxm(value));
}

export function shortHash(value: string) {
  if (value.length <= 18) return value;
  return `${value.slice(0, 10)}...${value.slice(-8)}`;
}

async function poolFetch<T>(path: string): Promise<T> {
  const response = await fetch(`${getPoolApiUrl()}${path}`, {
    cache: "no-store",
    headers: { accept: "application/json" }
  });

  if (!response.ok) {
    throw new Error(`pool ${path} returned HTTP ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function getPoolSnapshot(): Promise<PoolSnapshot> {
  try {
    const [stats, payouts] = await Promise.all([
      poolFetch<PoolStats>("/pool/stats"),
      poolFetch<PayoutEntry[]>("/pool/accounting")
    ]);

    return {
      ok: true,
      generatedAt: new Date().toISOString(),
      poolApiUrl: getPoolApiUrl(),
      stats,
      payouts
    };
  } catch (error) {
    return {
      ok: false,
      generatedAt: new Date().toISOString(),
      poolApiUrl: getPoolApiUrl(),
      stats: EMPTY_STATS,
      payouts: [],
      error: error instanceof Error ? error.message : "pool backend unavailable"
    };
  }
}

export async function getMinerPending(address: string): Promise<MinerPending> {
  const cleanAddress = address.trim();
  if (!cleanAddress) {
    throw new Error("miner address is required");
  }
  return poolFetch<MinerPending>(`/pool/pending/${encodeURIComponent(cleanAddress)}`);
}
