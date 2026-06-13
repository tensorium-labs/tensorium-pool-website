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

export type BlockStatus =
  | "candidate"
  | "immature"
  | "confirmed"
  | "orphan"
  | "paid";

export type PoolBlockRow = PayoutEntry & {
  status: BlockStatus;
  confirmations: number | null;
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
  payout_history: PoolBlockRow[];
  error?: string;
};

export type PoolSnapshot = {
  ok: boolean;
  generatedAt: string;
  poolApiUrl: string;
  stats: PoolStats;
  payouts: PoolBlockRow[];
  stratum: StratumSnapshot | null;
  error?: string;
};

export const POOL_FEE_BPS = 500;
export const POOL_FEE_PERCENT = POOL_FEE_BPS / 100;
export const POOL_TREASURY_ADDRESS =
  "txm1px2nmtp087mz8dv3lplqadwzxawk0c5kg0mt24";
const ACTIVE_WORKER_MAX_IDLE_SECS = 120;
const DEFAULT_NODE_RPC_URL = "https://rpc.tensoriumlabs.com";
const DEFAULT_POOL_FETCH_TIMEOUT_MS = Number.parseInt(
  process.env.TENSORIUM_POOL_FETCH_TIMEOUT_MS ?? "4000",
  10
);
const DEFAULT_NODE_FETCH_TIMEOUT_MS = Number.parseInt(
  process.env.TENSORIUM_NODE_FETCH_TIMEOUT_MS ?? "2500",
  10
);
const COINBASE_MATURITY_BLOCKS = Number.parseInt(
  process.env.TENSORIUM_COINBASE_MATURITY_BLOCKS ?? "10",
  10
);

const EMPTY_STATS: PoolStats = {
  blocks_found: 0,
  total_gross_atoms: 0,
  total_fee_atoms: 0,
  total_pending_net_atoms: 0
};

export function getPoolApiUrl() {
  return process.env.TENSORIUM_POOL_API_URL ?? "http://127.0.0.1:23336";
}

function getNodeRpcUrl() {
  return process.env.TENSORIUM_NODE_RPC_URL ?? DEFAULT_NODE_RPC_URL;
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

async function fetchJsonWithTimeout<T>(url: string, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: { accept: "application/json" },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`${url} returned HTTP ${response.status}`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

async function poolFetch<T>(path: string): Promise<T> {
  return fetchJsonWithTimeout<T>(
    `${getPoolApiUrl()}${path}`,
    DEFAULT_POOL_FETCH_TIMEOUT_MS
  );
}

async function fetchFromPoolBase<T>(baseUrl: string, path: string): Promise<T> {
  return fetchJsonWithTimeout<T>(
    `${baseUrl}${path}`,
    DEFAULT_POOL_FETCH_TIMEOUT_MS
  );
}

function toBasicPoolBlockRows(entries: PayoutEntry[]): PoolBlockRow[] {
  return entries.map((entry) => ({
    ...entry,
    confirmations: null,
    status: entry.paid_out ? "paid" : "candidate"
  }));
}

function mergePoolResults(
  results: Array<{
    stats: PoolStats;
    payouts: PayoutEntry[];
    stratum: StratumSnapshot | null;
  }>,
  generatedAtUnix: number
) {
  const stats: PoolStats = results.reduce(
    (acc, result) => ({
      blocks_found: acc.blocks_found + result.stats.blocks_found,
      total_gross_atoms: acc.total_gross_atoms + result.stats.total_gross_atoms,
      total_fee_atoms: acc.total_fee_atoms + result.stats.total_fee_atoms,
      total_pending_net_atoms:
        acc.total_pending_net_atoms + result.stats.total_pending_net_atoms
    }),
    {
      blocks_found: 0,
      total_gross_atoms: 0,
      total_fee_atoms: 0,
      total_pending_net_atoms: 0
    }
  );

  const payoutMap = new Map<string, PayoutEntry>();
  results.flatMap((result) => result.payouts).forEach((payout) => {
    const key = [
      payout.block_height,
      payout.block_hash,
      payout.miner_address,
      payout.gross_reward_atoms,
      payout.pool_fee_atoms,
      payout.net_payout_atoms
    ].join("-");
    if (!payoutMap.has(key)) payoutMap.set(key, payout);
  });

  const stratums = results
    .map((result) => result.stratum)
    .filter((stratum): stratum is StratumSnapshot => stratum !== null);
  const workers = filterFreshWorkers(
    stratums.flatMap((stratum) => stratum.active_workers),
    generatedAtUnix
  );
  const stratum: StratumSnapshot | null =
    stratums.length === 0
      ? null
      : {
          stratum_workers: workers.length,
          authorized_workers: workers.length,
          stratum_port: stratums[0].stratum_port,
          initial_share_diff_bits: stratums[0].initial_share_diff_bits,
          shares_accepted: stratums.reduce(
            (sum, item) => sum + item.shares_accepted,
            0
          ),
          shares_rejected: stratums.reduce(
            (sum, item) => sum + item.shares_rejected,
            0
          ),
          blocks_found: stratums.reduce((sum, item) => sum + item.blocks_found, 0),
          active_workers: workers,
          vardiff: stratums[0].vardiff
        };

  return {
    stats,
    payouts: Array.from(payoutMap.values()),
    stratum
  };
}

async function fetchOnePool(baseUrl: string): Promise<{
  stats: PoolStats; payouts: PayoutEntry[]; stratum: StratumSnapshot | null;
} | null> {
  try {
    const stats = await fetchFromPoolBase<PoolStats>(baseUrl, "/pool/stats");
    const [payouts, stratum] = await Promise.all([
      fetchFromPoolBase<PayoutEntry[]>(baseUrl, "/pool/accounting").catch(
        () => []
      ),
      fetchFromPoolBase<StratumSnapshot>(baseUrl, "/pool/stratum").catch(
        () => null
      )
    ]);
    return { stats, payouts, stratum };
  } catch {
    return null;
  }
}

function filterFreshWorkers(
  workers: StratumWorker[],
  generatedAtUnix: number
) {
  return workers.filter((worker) => {
    const lastSeen = worker.last_seen_at_unix || worker.authorized_at_unix || 0;
    return generatedAtUnix - lastSeen <= ACTIVE_WORKER_MAX_IDLE_SECS;
  });
}

export async function getPoolSnapshot(): Promise<PoolSnapshot> {
  const primaryUrl = getPoolApiUrl();
  const secondaryUrls = getSecondaryPoolUrls();
  const generatedAt = new Date().toISOString();
  const generatedAtUnix = Math.floor(Date.parse(generatedAt) / 1000);

  // Fetch from all pool backends in parallel.
  const [primary, ...secondaries] = await Promise.all([
    fetchOnePool(primaryUrl),
    ...secondaryUrls.map(fetchOnePool),
  ]);

  if (!primary && secondaries.every((result) => result === null)) {
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

  const allResults = [primary, ...secondaries].filter(
    (result): result is NonNullable<typeof result> => result !== null
  );
  const merged = mergePoolResults(allResults, generatedAtUnix);
  const payouts = toBasicPoolBlockRows(merged.payouts)
    .sort((a, b) => b.block_height - a.block_height)
    .slice(0, 12);

  return {
    ok: true,
    generatedAt,
    poolApiUrl: primaryUrl,
    stats: merged.stats,
    payouts,
    stratum: merged.stratum,
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

  const [snapshot, pendingResult, payoutRows] = await Promise.all([
    getPoolSnapshot(),
    getMinerPending(cleanAddress).catch((error) => ({
      miner_address: cleanAddress,
      pending_net_atoms: 0,
      error: error instanceof Error ? error.message : "miner lookup failed"
    })),
    poolFetch<PayoutEntry[]>("/pool/accounting")
      .then((entries) =>
        enrichPayoutRows(entries).catch(() => toBasicPoolBlockRows(entries))
      )
      .catch(() => [])
  ]);

  const payoutHistory = payoutRows
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
  blocks: PoolBlockRow[];
  total: number;
  error?: string;
};

type NodeBlockCount = {
  height?: number | null;
};

type NodeBlockAtHeight = {
  hash: string;
};

async function nodeFetch<T>(path: string): Promise<T> {
  return fetchJsonWithTimeout<T>(
    `${getNodeRpcUrl()}${path}`,
    DEFAULT_NODE_FETCH_TIMEOUT_MS
  );
}

function deriveBlockStatus(args: {
  paidOut: boolean;
  canonicalHash: string | null;
  ledgerHash: string;
  confirmations: number | null;
}) {
  const { paidOut, canonicalHash, ledgerHash, confirmations } = args;

  if (paidOut) {
    return "paid" as const;
  }
  if (!canonicalHash) {
    return "candidate" as const;
  }
  if (canonicalHash !== ledgerHash) {
    return "orphan" as const;
  }
  if ((confirmations ?? 0) <= 1) {
    return "candidate" as const;
  }
  if ((confirmations ?? 0) < COINBASE_MATURITY_BLOCKS) {
    return "immature" as const;
  }
  return "confirmed" as const;
}

async function enrichPayoutRows(entries: PayoutEntry[]): Promise<PoolBlockRow[]> {
  const heights = Array.from(
    new Set(entries.map((entry) => entry.block_height))
  ).sort((a, b) => b - a);
  const [{ height: chainHeight }, ...blockResponses] = await Promise.all([
    nodeFetch<NodeBlockCount>("/getblockcount").catch(() => ({ height: null })),
    ...heights.map((height) =>
      nodeFetch<NodeBlockAtHeight>(`/getblock/${height}`).catch(() => null)
    )
  ]);
  const canonicalHashes = new Map<number, string | null>();
  heights.forEach((height, index) => {
    canonicalHashes.set(height, blockResponses[index]?.hash ?? null);
  });

  return entries.map((entry) => {
    const canonicalHash = canonicalHashes.get(entry.block_height) ?? null;
    const confirmations =
      canonicalHash && chainHeight != null && canonicalHash === entry.block_hash
        ? Math.max(0, chainHeight - entry.block_height + 1)
        : null;
    return {
      ...entry,
      confirmations,
      status: deriveBlockStatus({
        paidOut: entry.paid_out,
        canonicalHash,
        ledgerHash: entry.block_hash,
        confirmations
      })
    };
  });
}

export async function getPoolBlocks(): Promise<BlocksSnapshot> {
  try {
    const payouts = await poolFetch<PayoutEntry[]>("/pool/accounting");
    const rows = await enrichPayoutRows(payouts).catch(() =>
      toBasicPoolBlockRows(payouts)
    );
    const sorted = [...rows].sort((a, b) => b.block_height - a.block_height);
    const total = new Set(
      sorted.map((entry) => `${entry.block_height}:${entry.block_hash}`)
    ).size;
    return {
      ok: true,
      generatedAt: new Date().toISOString(),
      blocks: sorted,
      total,
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
