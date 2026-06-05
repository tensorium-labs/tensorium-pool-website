import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  BadgeCent,
  CircleDollarSign,
  Gauge,
  History,
  Server,
  Wallet
} from "lucide-react";
import {
  formatHashrate,
  formatTxm,
  getMinerDashboard,
  shortHash
} from "@/lib/pool";

export const dynamic = "force-dynamic";

export default async function MinerDashboardPage({
  params
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = await params;
  const dashboard = await getMinerDashboard(address);

  return (
    <main>
      <header className="topbar">
        <div className="brand">
          <div className="brandMark">
            <img src="/assets/tensorium-mark.svg" alt="Tensorium" />
          </div>
          <div>
            <span>Tensorium Pool</span>
            <small>Miner dashboard</small>
          </div>
        </div>
        <nav aria-label="Miner navigation">
          <Link href="/">Home</Link>
          <a href="#workers">Workers</a>
          <a href="#payouts">Payouts</a>
        </nav>
      </header>

      <section className="hero heroCompact">
        <div className="heroCopy">
          <p className="eyebrow">Miner dashboard</p>
          <h1>Address payout and worker activity.</h1>
          <p>
            Address <strong className="inlineAddress">{dashboard.miner_address}</strong>
          </p>
          <div className="heroActions">
            <Link className="secondaryAction" href="/">
              <ArrowLeft size={18} />
              Back to pool
            </Link>
          </div>
        </div>

        <div className="statusPanel" aria-live="polite">
          <div className="statusLine">
            <span className={dashboard.ok ? "statusDot ok" : "statusDot"} />
            {dashboard.ok ? "Miner data loaded" : "Pool backend degraded"}
          </div>
          <dl>
            <div>
              <dt>Pending Balance</dt>
              <dd>{formatTxm(dashboard.pending_net_atoms)} TXM</dd>
            </div>
            <div>
              <dt>Total Payout</dt>
              <dd>{formatTxm(dashboard.total_paid_atoms)} TXM</dd>
            </div>
            <div>
              <dt>Updated</dt>
              <dd>{new Date(dashboard.generatedAt).toLocaleTimeString()}</dd>
            </div>
            <div>
              <dt>Share Difficulty</dt>
              <dd>{dashboard.share_difficulty ?? "-"}</dd>
            </div>
          </dl>
          {dashboard.error ? <p className="warning">{dashboard.error}</p> : null}
        </div>
      </section>

      <section className="metricGrid" aria-label="Miner stats">
        <Metric
          icon={<Wallet size={22} />}
          label="Pending Balance"
          value={`${formatTxm(dashboard.pending_net_atoms)} TXM`}
        />
        <Metric
          icon={<CircleDollarSign size={22} />}
          label="Total Payout"
          value={`${formatTxm(dashboard.total_paid_atoms)} TXM`}
        />
        <Metric
          icon={<BadgeCent size={22} />}
          label="Gross Rewards"
          value={`${formatTxm(dashboard.total_gross_atoms)} TXM`}
        />
        <Metric
          icon={<Server size={22} />}
          label="Active Workers"
          value={dashboard.active_workers.length.toLocaleString()}
        />
        <Metric
          icon={<Activity size={22} />}
          label="Accepted Shares"
          value={dashboard.total_accepted_shares.toLocaleString()}
        />
        <Metric
          icon={<History size={22} />}
          label="Rejected Shares"
          value={dashboard.total_rejected_shares.toLocaleString()}
        />
        <Metric
          icon={<Gauge size={22} />}
          label="Est. Hashrate"
          value={formatHashrate(dashboard.estimated_hashrate_hps)}
        />
        <Metric
          icon={<History size={22} />}
          label="Credited Blocks"
          value={dashboard.total_blocks.toLocaleString()}
        />
      </section>

      <section id="workers" className="sectionBlock">
        <div className="sectionHeader">
          <div>
            <p className="eyebrow">Worker detail</p>
            <h2>Live workers on this wallet</h2>
            <p>
              Estimated hashrate is derived from accepted share cadence because the
              pool backend does not expose miner-reported GPU hashrate directly yet.
            </p>
          </div>
          <Server size={24} />
        </div>
        <MinerWorkerTable
          rows={dashboard.active_workers}
          shareDifficulty={dashboard.share_difficulty}
        />
      </section>

      <section id="payouts" className="sectionBlock">
        <div className="sectionHeader">
          <div>
            <p className="eyebrow">Payout ledger</p>
            <h2>Blocks, fee, and net payout for this address</h2>
          </div>
          <History size={24} />
        </div>
        <MinerPayoutTable rows={dashboard.payout_history} />
      </section>
    </main>
  );
}

function Metric({
  icon,
  label,
  value
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <article className="metric">
      <div>{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function MinerWorkerTable({
  rows,
  shareDifficulty
}: {
  rows: Awaited<ReturnType<typeof getMinerDashboard>>["active_workers"];
  shareDifficulty: number | null;
}) {
  if (rows.length === 0) {
    return (
      <div className="emptyState">
        <Activity size={22} />
        <span>No active workers for this address right now.</span>
      </div>
    );
  }

  return (
    <div className="tableWrap">
      <table>
        <thead>
          <tr>
            <th>Worker</th>
            <th>Peer</th>
            <th>Accepted</th>
            <th>Rejected</th>
            <th>Last Result</th>
            <th>Est. Hashrate</th>
            <th>Last Seen</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.connection_id}>
              <td>{row.worker_name}</td>
              <td>{row.peer_addr}</td>
              <td>{row.accepted_shares.toLocaleString()}</td>
              <td>{row.rejected_shares.toLocaleString()}</td>
              <td>
                <span className="pill">{row.last_submit_result}</span>
              </td>
              <td>
                {formatHashrate(
                  estimateWorkerHashrate(
                    row.accepted_shares,
                    row.authorized_at_unix,
                    row.last_seen_at_unix,
                    shareDifficulty
                  )
                )}
              </td>
              <td>{new Date(row.last_seen_at_unix * 1000).toLocaleTimeString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MinerPayoutTable({
  rows
}: {
  rows: Awaited<ReturnType<typeof getMinerDashboard>>["payout_history"];
}) {
  if (rows.length === 0) {
    return (
      <div className="emptyState">
        <History size={22} />
        <span>No payout entries recorded for this address yet.</span>
      </div>
    );
  }

  return (
    <div className="tableWrap">
      <table>
        <thead>
          <tr>
            <th>Height</th>
            <th>Block</th>
            <th>Gross</th>
            <th>Fee</th>
            <th>Net</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.block_height}-${row.block_hash}`}>
              <td>{row.block_height.toLocaleString()}</td>
              <td title={row.block_hash}>{shortHash(row.block_hash)}</td>
              <td>{formatTxm(row.gross_reward_atoms)}</td>
              <td>{formatTxm(row.pool_fee_atoms)}</td>
              <td>{formatTxm(row.net_payout_atoms)}</td>
              <td>
                <span className={row.paid_out ? "pill paid" : "pill"}>
                  {row.paid_out ? "paid" : "pending"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function estimateWorkerHashrate(
  acceptedShares: number,
  authorizedAtUnix: number,
  lastSeenAtUnix: number,
  shareDifficulty: number | null
) {
  if (!shareDifficulty || shareDifficulty < 1) {
    return 0;
  }

  let shareBits = 0;
  let diff = Math.floor(shareDifficulty);
  while (diff > 1) {
    diff >>= 1;
    shareBits += 1;
  }

  const elapsedSeconds = Math.max(1, lastSeenAtUnix - authorizedAtUnix);
  return (acceptedShares * 2 ** shareBits) / elapsedSeconds;
}
