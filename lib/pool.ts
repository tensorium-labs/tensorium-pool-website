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
  /** Per-worker vardiff: leading-zero bits required for a valid share. */
  share_diff_bits?: number;
  /** Per-worker vardiff: raw difficulty threshold (2^share_diff_bits). */
  share_diff?: number;
};

export type VardiffConfig = {
  window_secs: number;
  target_min: number;
  target_max: number;
  min_bits: number;
  max_bits: number;
};

export type StratumSnapshot = {
  stratum_workers: number;
  authorized_workers: number;
  stratum_port: number;
  /** @deprecated Replaced by initial_share_diff_bits + per-worker share_diff_bits */
  share_difficulty?: number;
  /** Initial/global share difficulty in bits (new field). */
  initial_share_diff_bits?: number;
  shares_accepted: number;
  shares_rejected: number;
  blocks_found: number;
  active_workers: StratumWorker[];
  vardiff?: VardiffConfig;
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

/** Secondary pool URLs to aggregate (comma-separated, server-side only). */
function getSecondaryPoolUrls(): string[] {
  return (process.env.TENSORIUM_POOL_API_URL_SECONDARY ?? "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
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

async function fetchOnePool(baseUrl: string): Promise<{
  stats: PoolStats; payouts: PayoutEntry[]; stratum: StratumSnapshot | null;
} | null> {
  try {
    const fetchFrom = async <T>(path: string): Promise<T> => {
      const r = await fetch(`${baseUrl}${path}`, { cache: "no-store", headers: { accept: "application/json" } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<T>;
    };
    const [stats, payouts] = await Promise.all([
      fetchFrom<PoolStats>("/pool/stats"),
      fetchFrom<PayoutEntry[]>("/pool/accounting"),
    ]);
    const stratum = await fetchFrom<StratumSnapshot>("/pool/stratum").catch(() => null);
    return { stats, payouts, stratum };
  } catch {
    return null;
  }
}

export async function getPoolSnapshot(): Promise<PoolSnapshot> {
  const primaryUrl = getPoolApiUrl();
  const secondaryUrls = getSecondaryPoolUrls();

  // Fetch from all pool backends in parallel.
  const [primary, ...secondaries] = await Promise.all([
    fetchOnePool(primaryUrl),
    ...secondaryUrls.map(fetchOnePool),
  ]);

  if (!primary && secondaries.every(s => s === null)) {
    return {
      ok: false,
      generatedAt: new Date().toISOString(),
      poolApiUrl: primaryUrl,
      stats: EMPTY_STATS,
      payouts: [],
      stratum: null,
      error: "all pool backends unavailable",
    };
  }

  // Merge: sum stats, keep one entry per unique payout row, merge workers.
  const allResults = [primary, ...secondaries].filter((r): r is NonNullable<typeof r> => r !== null);

  const mergedStats: PoolStats = allResults.reduce((acc, r) => ({
    blocks_found:             acc.blocks_found + r.stats.blocks_found,
    total_gross_atoms:        acc.total_gross_atoms + r.stats.total_gross_atoms,
    total_fee_atoms:          acc.total_fee_atoms + r.stats.total_fee_atoms,
    total_pending_net_atoms:  acc.total_pending_net_atoms + r.stats.total_pending_net_atoms,
  }), { blocks_found: 0, total_gross_atoms: 0, total_fee_atoms: 0, total_pending_net_atoms: 0 });

  // Deduplicate exact payout rows, but preserve sibling payouts from the same block.
  const payoutMap = new Map<string, PayoutEntry>();
  allResults.flatMap(r => r.payouts).forEach(p => {
    const key = [
      p.block_height,
      p.block_hash,
      p.miner_address,
      p.gross_reward_atoms,
      p.pool_fee_atoms,
      p.net_payout_atoms
    ].join("-");
    if (!payoutMap.has(key)) payoutMap.set(key, p);
  });
  const mergedPayouts = Array.from(payoutMap.values())
    .sort((a, b) => a.block_height - b.block_height);

  // Merge stratum: combine workers, sum counters.
  const stratums = allResults.map(r => r.stratum).filter((s): s is StratumSnapshot => s !== null);
  const mergedStratum: StratumSnapshot | null = stratums.length === 0 ? null : {
    stratum_workers:       stratums.reduce((s, x) => s + x.stratum_workers, 0),
    authorized_workers:    stratums.reduce((s, x) => s + x.authorized_workers, 0),
    stratum_port:          stratums[0].stratum_port,
    initial_share_diff_bits: stratums[0].initial_share_diff_bits,
    shares_accepted:       stratums.reduce((s, x) => s + x.shares_accepted, 0),
    shares_rejected:       stratums.reduce((s, x) => s + x.shares_rejected, 0),
    blocks_found:          stratums.reduce((s, x) => s + x.blocks_found, 0),
    active_workers:        stratums.flatMap(x => x.active_workers),
    vardiff:               stratums[0].vardiff,
  };

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    poolApiUrl: primaryUrl,
    stats: mergedStats,
    payouts: mergedPayouts,
    stratum: mergedStratum,
  };
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

function estimateWorkerHashrate(worker: StratumWorker, globalShareDifficulty: number | null) {
  // Use per-worker share_diff if available (vardiff), else fall back to global.
  const diff = worker.share_diff ?? globalShareDifficulty;
  if (!diff || diff < 1) return 0;

  const elapsedSeconds = Math.max(
    1,
    worker.last_seen_at_unix - worker.authorized_at_unix
  );
  const shareBits = worker.share_diff_bits ?? shareBitsFromDifficulty(diff);
  const hashesPerAcceptedShare = Math.pow(2, shareBits);

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
  // Prefer global initial diff from new API; fall back to legacy share_difficulty field.
  const shareDifficulty =
    snapshot.stratum?.initial_share_diff_bits != null
      ? Math.pow(2, snapshot.stratum.initial_share_diff_bits)
      : (snapshot.stratum?.share_difficulty ?? null);

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
