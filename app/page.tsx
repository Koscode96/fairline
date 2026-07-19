import Link from "next/link";

export default function Landing() {
  return (
    <div className="wrap">
      <div className="brand" style={{ marginTop: 26 }}>
        <h1>FAIR<b>LINE</b></h1>
        <div className="net">FAIR ODDS · VERIFIED</div>
      </div>
      <div className="hero">
        <h2>Fair odds. No bookmaker.</h2>
        <p>Live fair World Cup odds. See what your bookie really charges.</p>
      </div>
      <Link href="/xray" className="tile">
        <span className="tile-t">ACCA X-RAY</span>
        <span className="tile-d">Scan your bet slip. See the margin your bookie hides.</span>
      </Link>
      <a href={process.env.NEXT_PUBLIC_FAIRPLAY_URL ?? "#"} className="tile">
        <span className="tile-t">FAIRPLAY ↗</span>
        <span className="tile-d">Back a bet or take one, at fair odds. No bookmaker.</span>
      </a>
      <Link href="/xray" className="tile">
        <span className="tile-t">LIVE MARKETS</span>
        <span className="tile-d">Match result, goals and handicaps for the final.</span>
      </Link>
      <p className="foot" style={{ marginTop: 26 }}>The X-ray is free. No sign-up.<br />Wallet only needed to place a bet.</p>
    </div>
  );
}
