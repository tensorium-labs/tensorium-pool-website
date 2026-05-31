"use client";

import {
  Activity,
  BadgeCent,
  CheckCircle2,
  CircleDollarSign,
  Copy,
  ExternalLink,
  Gauge,
  History,
  Pickaxe,
  Search,
  Server,
  ShieldCheck,
  Wallet
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  POOL_FEE_PERCENT,
  POOL_TREASURY_ADDRESS,
  PayoutEntry,
  PoolSnapshot,
  formatTxm,
  shortHash
} from "@/lib/pool";

type MinerLookup = {
  miner_address: string;
  pending_net_atoms: number;
};

const DEFAULT_SNAPSHOT: PoolSnapshot = {
  ok: false,
  generatedAt: new Date().toISOString(),
  poolApiUrl: "",
  stats: {
    blocks_found: 0,
    total_gross_atoms: 0,
    total_fee_atoms: 0,
    total_pending_net_atoms: 0
  },
  payouts: []
};

const poolHost =
  process.env.NEXT_PUBLIC_POOL_HOST ?? "pool.tensoriumlabs.com:23336";
const chainName =
  process.env.NEXT_PUBLIC_CHAIN_NAME ?? "Tensorium public testnet pool";

export default function Home() {
  const [snapshot, setSnapshot] = useState<PoolSnapshot>(DEFAULT_SNAPSHOT);
  const [loading, setLoading] = useState(true);
  const [address, setAddress] = useState("");
  const [lookup, setLookup] = useState<MinerLookup | null>(null);
  const [lookupError, setLookupError] = useState("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/pool", { cache: "no-store" });
        const data = (await response.json()) as PoolSnapshot;
        if (active) setSnapshot(data);
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    const interval = window.setInterval(load, 30_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  const recentPayouts = useMemo(
    () => [...snapshot.payouts].reverse().slice(0, 12),
    [snapshot.payouts]
  );

  async function submitLookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLookup(null);
    setLookupError("");

    const cleanAddress = address.trim();
    if (!cleanAddress) {
      setLookupError("Enter a miner address first.");
      return;
    }

    const response = await fetch(
      `/api/miner?address=${encodeURIComponent(cleanAddress)}`,
      { cache: "no-store" }
    );
    const data = await response.json();

    if (!response.ok) {
      setLookupError(data.error ?? "Lookup failed.");
      return;
    }

    setLookup(data as MinerLookup);
  }

  return (
    <main>
      <header className="topbar">
        <div className="brand">
          <div className="brandMark">
            <Pickaxe size={20} />
          </div>
          <div>
            <span>Tensorium Pool</span>
            <small>{chainName}</small>
          </div>
        </div>
        <nav aria-label="Pool sections">
          <a href="#stats">Stats</a>
          <a href="#miner">Miner</a>
          <a href="#payouts">Payouts</a>
          <a href="#connect">Connect</a>
          <a href="#fees">Fees</a>
        </nav>
      </header>

      <section className="hero">
        <div className="heroCopy">
          <p className="eyebrow">Official reference pool</p>
          <h1>Mine TXM with transparent payout accounting.</h1>
          <p>
            Public stats, miner pending balances, payout history, and the fixed
            {` ${POOL_FEE_PERCENT}%`} pool fee are visible before miners connect.
          </p>
          <div className="heroActions">
            <a className="primaryAction" href="#connect">
              <Server size={18} />
              Connect miner
            </a>
            <a className="secondaryAction" href="#fees">
              <ShieldCheck size={18} />
              Review fee
            </a>
          </div>
        </div>
        <div className="statusPanel" aria-live="polite">
          <div className="statusLine">
            <span className={snapshot.ok ? "statusDot ok" : "statusDot"} />
            {loading
              ? "Loading pool backend"
              : snapshot.ok
                ? "Pool backend online"
                : "Pool backend not reporting yet"}
          </div>
          <dl>
            <div>
              <dt>Blocks Found</dt>
              <dd>{snapshot.stats.blocks_found.toLocaleString()}</dd>
            </div>
            <div>
              <dt>Pending Net</dt>
              <dd>{formatTxm(snapshot.stats.total_pending_net_atoms)} TXM</dd>
            </div>
            <div>
              <dt>Updated</dt>
              <dd>{new Date(snapshot.generatedAt).toLocaleTimeString()}</dd>
            </div>
          </dl>
          {snapshot.error ? <p className="warning">{snapshot.error}</p> : null}
        </div>
      </section>

      <section id="stats" className="metricGrid" aria-label="Pool stats">
        <Metric
          icon={<Gauge size={22} />}
          label="Gross Rewards"
          value={`${formatTxm(snapshot.stats.total_gross_atoms)} TXM`}
        />
        <Metric
          icon={<BadgeCent size={22} />}
          label="Pool Fee Collected"
          value={`${formatTxm(snapshot.stats.total_fee_atoms)} TXM`}
        />
        <Metric
          icon={<CircleDollarSign size={22} />}
          label="Pending Net Payout"
          value={`${formatTxm(snapshot.stats.total_pending_net_atoms)} TXM`}
        />
        <Metric
          icon={<Activity size={22} />}
          label="Payout Entries"
          value={snapshot.payouts.length.toLocaleString()}
        />
      </section>

      <section id="miner" className="splitSection">
        <div>
          <p className="eyebrow">Miner lookup</p>
          <h2>Check pending payout</h2>
          <p>
            Paste the wallet address used by your miner. The pool returns unpaid
            net TXM after the official pool fee.
          </p>
        </div>
        <form className="lookupPanel" onSubmit={submitLookup}>
          <label htmlFor="miner-address">Miner wallet address</label>
          <div className="lookupRow">
            <input
              id="miner-address"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="txm1..."
              autoComplete="off"
            />
            <button type="submit" aria-label="Search miner address">
              <Search size={18} />
            </button>
          </div>
          {lookup ? (
            <div className="lookupResult">
              <Wallet size={20} />
              <span>{formatTxm(lookup.pending_net_atoms)} TXM pending</span>
            </div>
          ) : null}
          {lookupError ? <p className="warning">{lookupError}</p> : null}
        </form>
      </section>

      <section id="payouts" className="sectionBlock">
        <div className="sectionHeader">
          <div>
            <p className="eyebrow">Payout history</p>
            <h2>Gross, fee, and net per accepted block</h2>
          </div>
          <History size={24} />
        </div>
        <PayoutTable rows={recentPayouts} />
      </section>

      <section id="connect" className="splitSection">
        <div>
          <p className="eyebrow">Connect guide</p>
          <h2>Point miners at the pool RPC endpoint</h2>
          <p>
            Use the same miner command format as solo mining, but replace the
            node RPC host with the pool host. The pool submits blocks to the node
            and credits your address in the payout ledger.
          </p>
        </div>
        <div className="commandPanel">
          <Command text={`txmminer ${poolHost} <your_txm_address>`} />
          <Command text={`txmminer-cuda ${poolHost} <your_txm_address>`} />
          <a href="https://docs.tensoriumlabs.com/mining.html">
            Mining docs <ExternalLink size={16} />
          </a>
        </div>
      </section>

      <section id="fees" className="feeBand">
        <div>
          <p className="eyebrow">Fee disclosure</p>
          <h2>{POOL_FEE_PERCENT}% official pool fee</h2>
          <p>
            The pool fee is charged at payout accounting level only. It is not a
            protocol tax. Solo miners can mine directly against their own node
            without this pool fee.
          </p>
        </div>
        <div className="feeFacts">
          <Fact label="Fee rate" value={`${POOL_FEE_PERCENT}% / 500 bps`} />
          <Fact label="Treasury address" value={POOL_TREASURY_ADDRESS} />
          <Fact label="Accounting" value="gross reward - fee = net payout" />
        </div>
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

function PayoutTable({ rows }: { rows: PayoutEntry[] }) {
  if (rows.length === 0) {
    return (
      <div className="emptyState">
        <CheckCircle2 size={22} />
        <span>No accepted pool blocks recorded yet.</span>
      </div>
    );
  }

  return (
    <div className="tableWrap">
      <table>
        <thead>
          <tr>
            <th>Height</th>
            <th>Miner</th>
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
              <td title={row.miner_address}>{shortHash(row.miner_address)}</td>
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

function Command({ text }: { text: string }) {
  async function copy() {
    await navigator.clipboard.writeText(text);
  }

  return (
    <div className="command">
      <code>{text}</code>
      <button type="button" onClick={copy} aria-label="Copy command">
        <Copy size={16} />
      </button>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="fact">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
