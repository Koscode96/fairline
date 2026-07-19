"use client";
import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { decodeXray } from "../../lib/xray-codec";
import { xray } from "../../lib/engine";

function XCard() {
  const params = useSearchParams();
  const data = useMemo(() => decodeXray(params.get("d") ?? ""), [params]);
  if (!data) return <div className="wrap"><p className="foot" style={{ marginTop: 80 }}>Invalid share link.</p></div>;
  const matched = data.legs.filter((l) => l.matched);
  const r = matched.length
    ? xray(matched.map((l, i) => ({ fixtureId: String(i), marketId: "x", label: l.label, bookiePrice: l.bookie, fairPrice: l.fair })), data.acca, data.stake)
    : null;
  return (
    <div className="wrap">
      <div className="brand"><h1><Link href="/" style={{ color: "inherit", textDecoration: "none" }}>FAIR<b>LINE</b></Link></h1><div className="net">SHARED X-RAY</div></div>
      {r && (
        <div className="card verdict">
          <p className="eyebrow" style={{ marginLeft: 0 }}>Margin X-ray</p>
          <div className="big">{r.accaMarginPct.toFixed(1)}<small>%</small></div>
          <p>is what this acca charges above the verified fair price.<br />
            <b>£{data.stake.toFixed(0)} staked → expected value −£{Math.abs(r.expectedValueAbs).toFixed(2)}.</b></p>
          <div className="kv">
            <div><div className="k">Their price</div><div className="v">{r.accaBookiePrice.toFixed(2)}</div></div>
            <div><div className="k">Fair price</div><div className="v">{r.accaFairPrice.toFixed(2)}</div></div>
            <div><div className="k">EV / £{data.stake.toFixed(0)}</div><div className="v neg">−£{Math.abs(r.expectedValueAbs).toFixed(2)}</div></div>
          </div>
        </div>
      )}
      <div className="card">
        {data.legs.map((l, i) => (
          <div className={`scanleg ${l.matched ? "" : "unmatched"}`} key={i}>
            <div className="top">
              <div className="lbl">{l.label}</div>
              <div className="pm">{l.matched ? `+${(((1 / l.bookie) / (1 / l.fair) - 1) * 100).toFixed(1)}%` : "EXCLUDED"}</div>
            </div>
            <div className="sub"><span>{l.matched ? `theirs ${l.bookie.toFixed(2)} · fair ${l.fair.toFixed(2)}` : "No fair price available for this market yet"}</span></div>
          </div>
        ))}
      </div>
      <Link href="/xray" className="go" style={{ display: "block", textAlign: "center", textDecoration: "none", marginTop: 14 }}>
        RUN YOUR OWN X-RAY →
      </Link>
      {r && (
        <div className="mkrow" style={{ marginTop: 10, justifyContent: "center" }}>
          <a className="mkpx" style={{ textDecoration: "none" }} target="_blank" rel="noreferrer"
            href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Check how much extra the bookies are charging: ${r.accaMarginPct.toFixed(1)}% over the verified fair price. X-rayed on Fairline`)}&url=${encodeURIComponent(typeof window !== "undefined" ? window.location.href : "")}`}>
            POST TO X ↗
          </a>
          <button className="mkpx" onClick={() => navigator.clipboard.writeText(window.location.href)}>COPY LINK</button>
        </div>
      )}
      <p className="foot">Fair odds verified by TxODDS.<br />Every price independently checkable.</p>
    </div>
  );
}
export default function Page() {
  return <Suspense fallback={<div className="wrap"><p className="foot" style={{ marginTop: 80 }}>LOADING…</p></div>}><XCard /></Suspense>;
}
