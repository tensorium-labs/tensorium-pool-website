"use client";

import { Blocks, ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import {
  BlocksSnapshot,
  POOL_FEE_PERCENT,
  POOL_TREASURY_ADDRESS,
  formatTxm,
  shortHash,
} from "@/lib/pool";

const EXPLORER = "https://explorer.tensoriumlabs.com";
const chainName =
  process.env.NEXT_PUBLIC_CHAIN_NAME ??
  "Tensorium mainnet pool";

const EMPTY: BlocksSnapshot = {
  ok: false,
  generatedAt: new Date().toISOString(),
  blocks: [],
  total: 0,
};

function relativeTime(isoOrEpoch?: string | number): string {
  if (!isoOrEpoch) return "—";
  const ms =
    typeof isoOrEpoch === "number"
      ? isoOrEpoch * 1000
      : new Date(isoOrEpoch).getTime();
  const diff = Math.floor((Date.now() - ms) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function BlocksPage() {
  const [snap, setSnap] = useState<BlocksSnapshot>(EMPTY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await fetch("/api/blocks", { cache: "no-store" });
        const data = (await res.json()) as BlocksSnapshot;
        if (active) setSnap(data);
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    const iv = window.setInterval(load, 30_000);
    return () => { active = false; window.clearInterval(iv); };
  }, []);

  return (
    <main>
      <header className="topbar">
        <div className="brand">
          <div className="brandMark">
            <img src="/assets/tensorium-mark.svg" alt="Tensorium" />
          </div>
          <div>
            <span>Tensorium Pool</span>
            <small>{chainName}</small>
          </div>
        </div>
        <nav aria-label="Pool sections">
          <a href="/">Overview</a>
          <a href="/blocks" style={{ color: "var(--cyan)", fontWeight: 700 }}>Blocks</a>
          <a href="/#connect">Connect</a>
          <a href="/#fees">Fees</a>
        </nav>
      </header>

      <div style={{ padding: "clamp(32px,6vw,72px) clamp(18px,5vw,72px)" }}>
        <div style={{ marginBottom: 32 }}>
          <p className="eyebrow">Pool History</p>
          <h2 style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Blocks size={28} style={{ color: "var(--cyan)" }} />
            Blocks Found by Pool
          </h2>
          <p>
            Every block this pool has successfully mined. Rewards are distributed
            net of the {POOL_FEE_PERCENT}% pool fee.
          </p>
          <p className="sectionNote">
            This page is <strong>pool-only</strong>. Direct or solo-mined blocks can still exist on-chain
            in the explorer, but they are not listed here because they bypass pool ledger accounting.
          </p>
        </div>

        <div
          style={{
            background: "var(--panel)",
            border: "1px solid var(--line)",
            borderRadius: 14,
            boxShadow: "var(--shadow)",
            overflow: "hidden",
          }}
        >
          {/* fee disclosure */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "8px 24px",
              padding: "12px 20px",
              borderBottom: "1px solid var(--line)",
              fontSize: "0.78rem",
              color: "var(--muted)",
              background: "rgba(11,142,163,0.04)",
            }}
          >
            <span>Pool fee: <strong style={{ color: "var(--ink)" }}>{POOL_FEE_PERCENT}%</strong></span>
            <span>
              Treasury:{" "}
              <a
                href={`${EXPLORER}/address/${POOL_TREASURY_ADDRESS}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--cyan)", fontFamily: "monospace" }}
              >
                {shortHash(POOL_TREASURY_ADDRESS)}
              </a>
            </span>
            <span>Solo mining is fee-free — point tensorium-miner directly at a node.</span>
          </div>

          {loading ? (
            <div style={{ padding: "48px 24px", textAlign: "center", color: "var(--muted)" }}>
              Loading…
            </div>
          ) : !snap.ok ? (
            <div style={{ padding: "48px 24px", textAlign: "center", color: "var(--muted)" }}>
              Pool backend unavailable. {snap.error}
            </div>
          ) : snap.blocks.length === 0 ? (
            <div style={{ padding: "64px 24px", textAlign: "center" }}>
              <Blocks size={40} style={{ color: "var(--line)", marginBottom: 16 }} />
              <p style={{ marginBottom: 8, fontWeight: 600, color: "var(--ink)" }}>
                No blocks found yet
              </p>
              <p style={{ fontSize: "0.88rem" }}>
                Point your miner at the pool and start mining. Every block found will appear here.
              </p>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.88rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--line)", textAlign: "left" }}>
                    {["Height", "Source", "Block Hash", "Miner", "Gross Reward", "Pool Fee", "Net Payout", "Paid", ""].map(
                      (h) => (
                        <th
                          key={h}
                          style={{ padding: "10px 16px", color: "var(--muted)", fontWeight: 600, whiteSpace: "nowrap" }}
                        >
                          {h}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody>
                  {snap.blocks.map((b, i) => (
                    <tr
                      key={b.block_height}
                      style={{
                        borderBottom: i < snap.blocks.length - 1 ? "1px solid var(--line)" : undefined,
                        background: i % 2 === 0 ? "transparent" : "rgba(11,142,163,0.02)",
                      }}
                    >
                      <td style={{ padding: "11px 16px", fontFamily: "monospace", fontWeight: 700 }}>
                        <a
                          href={`${EXPLORER}/block/${b.block_height}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: "var(--cyan)" }}
                        >
                          #{b.block_height}
                        </a>
                      </td>
                      <td style={{ padding: "11px 16px" }}>
                        <span className="sourceBadge pool">Pool block</span>
                      </td>
                      <td style={{ padding: "11px 16px", fontFamily: "monospace" }}>
                        <a
                          href={`${EXPLORER}/block/${b.block_height}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: "var(--cyan)" }}
                          title={b.block_hash}
                        >
                          {shortHash(b.block_hash)}
                        </a>
                      </td>
                      <td style={{ padding: "11px 16px", fontFamily: "monospace" }}>
                        <a
                          href={`${EXPLORER}/address/${b.miner_address}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: "var(--muted)" }}
                          title={b.miner_address}
                        >
                          {shortHash(b.miner_address)}
                        </a>
                      </td>
                      <td style={{ padding: "11px 16px", whiteSpace: "nowrap" }}>
                        {formatTxm(b.gross_reward_atoms)} TXM
                      </td>
                      <td style={{ padding: "11px 16px", whiteSpace: "nowrap", color: "var(--muted)" }}>
                        {formatTxm(b.pool_fee_atoms)} TXM
                      </td>
                      <td style={{ padding: "11px 16px", whiteSpace: "nowrap", fontWeight: 600, color: "var(--green)" }}>
                        {formatTxm(b.net_payout_atoms)} TXM
                      </td>
                      <td style={{ padding: "11px 16px" }}>
                        {b.paid_out ? (
                          <span
                            style={{
                              display: "inline-block",
                              padding: "2px 9px",
                              borderRadius: 99,
                              fontSize: "0.74rem",
                              fontWeight: 700,
                              background: "rgba(31,157,104,0.1)",
                              color: "var(--green)",
                              border: "1px solid rgba(31,157,104,0.3)",
                            }}
                          >
                            Paid
                          </span>
                        ) : (
                          <span
                            style={{
                              display: "inline-block",
                              padding: "2px 9px",
                              borderRadius: 99,
                              fontSize: "0.74rem",
                              fontWeight: 700,
                              background: "rgba(188,122,19,0.08)",
                              color: "var(--amber)",
                              border: "1px solid rgba(188,122,19,0.25)",
                            }}
                          >
                            Pending
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "11px 16px" }}>
                        <a
                          href={`${EXPLORER}/block/${b.block_height}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="View in explorer"
                          style={{ color: "var(--muted)", display: "flex", alignItems: "center" }}
                        >
                          <ExternalLink size={14} />
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div
            style={{
              padding: "10px 20px",
              borderTop: "1px solid var(--line)",
              fontSize: "0.78rem",
              color: "var(--muted)",
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <span>Total blocks found: <strong style={{ color: "var(--ink)" }}>{snap.total}</strong></span>
            <span>Updated {relativeTime(snap.generatedAt)}</span>
          </div>
        </div>
      </div>
    </main>
  );
}
