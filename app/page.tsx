import Link from "next/link";

export default function Landing() {
  return (
    <div className="wrap">
      <div className="brand" style={{ marginTop: 26 }}>
        <h1>FAIR<b>LINE</b></h1>
        <div className="net">TxODDS VERIFIED · SOLANA</div>
      </div>
      <div className="hero">
        <h2>Fair odds. No bookmaker.</h2>
        <p>Live de-margined World Cup prices from TxODDS, verified on Solana.</p>
      </div>
      <Link href="/xray" className="tile">
        <span className="tile-t">ACCA X-RAY</span>
        <span className="tile-d">Scan your bet slip. See the margin your bookie hides.</span>
      </Link>
      <a href={process.env.NEXT_PUBLIC_FAIRPLAY_URL ?? "#"} className="tile">
        <span className="tile-t">FAIRPLAY ↗</span>
        <span className="tile-d">Our P2P exchange. Take your fair odds to market.</span>
      </a>
      <Link href="/xray" className="tile">
        <span className="tile-t">LIVE MARKETS</span>
        <span className="tile-d">Result, goals, handicaps. Tonight and the final.</span>
      </Link>
      <p className="foot" style={{ marginTop: 26 }}>Wallet only needed to place or take a bet.<br />X-ray is free, no sign-up.</p>
    </div>
  );
}
