export type PoolStats = {
  blocks_found: number;
  total_gross_atoms: number;
  total_fee_atoms: number;
  total_pending_net_atoms: number;
};

export type StratumWorker = {
  connection_id: string;
  worker_name: string;
  wallet_address: string;
  peer_addr: string;
  authorized_at_unix: number;
  last_seen_at_unix: number;
  accepted_shares: number;
  rejected_shares: number;
  last_submit_result: string;
};

export type StratumSnapshot = {
  stratum_workers: number;
  authorized_workers: number;
  stratum_port: number;
  share_difficulty: number;
  shares_accepted: number;
  shares_rejected: number;
  blocks_found: number;
  active_workers: StratumWorker[];
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

export type MinerDashboard = {
  ok: boolean;
  generatedAt: string;
  miner_address: string;
  pending_net_atoms: number;
  total_paid_atoms: number;
  total_gross_atoms: number;
  total_fee_atoms: number;
  total_blocks: number;
  active_workers: StratumWorker[];
  total_accepted_shares: number;
  total_rejected_shares: number;
  share_difficulty: number | null;
  estimated_hashrate_hps: number;
  payout_history: PayoutEntry[];
  error?: string;
};

export type PoolSnapshot = {
  ok: boolean;
  generatedAt: string;
  poolApiUrl: string;
  stats: PoolStats;
  payouts: PayoutEntry[];
  stratum: StratumSnapshot | null;
  error?: string;
};

export const POOL_FEE_BPS = 500;
export const POOL_FEE_PERCENT = POOL_FEE_BPS / 100;
export const POOL_TREASURY_ADDRESS =
  "txm13vgxzj5ulrfhe7x0mlzxg0q6veq42tkku4g3jr";

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

export function formatHashrate(hps: number) {
  if (!Number.isFinite(hps) || hps <= 0) {
    return "0 H/s";
  }

  const units = ["H/s", "KH/s", "MH/s", "GH/s", "TH/s"];
  let value = hps;
  let unit = 0;

  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }

  return `${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: value >= 100 ? 0 : 2,
    maximumFractionDigits: value >= 100 ? 0 : 2
  }).format(value)} ${units[unit]}`;
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
    const stratum = await poolFetch<StratumSnapshot>("/pool/stratum").catch(
      () => null
    );

    return {
      ok: true,
      generatedAt: new Date().toISOString(),
      poolApiUrl: getPoolApiUrl(),
      stats,
      payouts,
      stratum
    };
  } catch (error) {
    return {
      ok: false,
      generatedAt: new Date().toISOString(),
      poolApiUrl: getPoolApiUrl(),
      stats: EMPTY_STATS,
      payouts: [],
      stratum: null,
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

function shareBitsFromDifficulty(diff: number) {
  let bits = 0;
  let value = Math.max(0, Math.floor(diff));
  while (value > 1) {
    value >>= 1;
    bits += 1;
  }
  return bits;
}

function estimateWorkerHashrate(worker: StratumWorker, shareDifficulty: number | null) {
  if (!shareDifficulty || shareDifficulty < 1) {
    return 0;
  }

  const elapsedSeconds = Math.max(
    1,
    worker.last_seen_at_unix - worker.authorized_at_unix
  );
  const shareBits = shareBitsFromDifficulty(shareDifficulty);
  const hashesPerAcceptedShare = 2 ** shareBits;

  return (worker.accepted_shares * hashesPerAcceptedShare) / elapsedSeconds;
}

export async function getMinerDashboard(address: string): Promise<MinerDashboard> {
  const cleanAddress = address.trim();
  if (!cleanAddress) {
    throw new Error("miner address is required");
  }

  const [snapshot, pendingResult] = await Promise.all([
    getPoolSnapshot(),
    getMinerPending(cleanAddress).catch((error) => ({
      miner_address: cleanAddress,
      pending_net_atoms: 0,
      error: error instanceof Error ? error.message : "miner lookup failed"
    }))
  ]);

  const payoutHistory = snapshot.payouts
    .filter((entry) => entry.miner_address === cleanAddress)
    .sort((a, b) => b.block_height - a.block_height);
  const activeWorkers =
    snapshot.stratum?.active_workers.filter(
      (worker) => worker.wallet_address === cleanAddress
    ) ?? [];
  const shareDifficulty = snapshot.stratum?.share_difficulty ?? null;

  const totalPaidAtoms = payoutHistory
    .filter((entry) => entry.paid_out)
    .reduce((total, entry) => total + entry.net_payout_atoms, 0);
  const totalGrossAtoms = payoutHistory.reduce(
    (total, entry) => total + entry.gross_reward_atoms,
    0
  );
  const totalFeeAtoms = payoutHistory.reduce(
    (total, entry) => total + entry.pool_fee_atoms,
    0
  );
  const totalAcceptedShares = activeWorkers.reduce(
    (total, worker) => total + worker.accepted_shares,
    0
  );
  const totalRejectedShares = activeWorkers.reduce(
    (total, worker) => total + worker.rejected_shares,
    0
  );
  const estimatedHashrate = activeWorkers.reduce(
    (total, worker) => total + estimateWorkerHashrate(worker, shareDifficulty),
    0
  );

  return {
    ok: snapshot.ok,
    generatedAt: snapshot.generatedAt,
    miner_address: cleanAddress,
    pending_net_atoms: pendingResult.pending_net_atoms,
    total_paid_atoms: totalPaidAtoms,
    total_gross_atoms: totalGrossAtoms,
    total_fee_atoms: totalFeeAtoms,
    total_blocks: payoutHistory.length,
    active_workers: activeWorkers,
    total_accepted_shares: totalAcceptedShares,
    total_rejected_shares: totalRejectedShares,
    share_difficulty: shareDifficulty,
    estimated_hashrate_hps: estimatedHashrate,
    payout_history: payoutHistory,
    error:
      snapshot.error ??
      ("error" in pendingResult ? pendingResult.error : undefined)
  };
}

export type BlocksSnapshot = {
  ok: boolean;
  generatedAt: string;
  blocks: PayoutEntry[];
  total: number;
  error?: string;
};

export async function getPoolBlocks(): Promise<BlocksSnapshot> {
  try {
    const payouts = await poolFetch<PayoutEntry[]>("/pool/accounting");
    const sorted = [...payouts].sort((a, b) => b.block_height - a.block_height);
    return {
      ok: true,
      generatedAt: new Date().toISOString(),
      blocks: sorted,
      total: sorted.length,
    };
  } catch (error) {
    return {
      ok: false,
      generatedAt: new Date().toISOString(),
      blocks: [],
      total: 0,
      error: error instanceof Error ? error.message : "pool backend unavailable",
    };
  }
}
