"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { xray, type Leg } from "../../lib/engine";
import { settle } from "../../lib/markets";
import { settledStats, eventTimeline, txStatus } from "../../lib/txline";
import { connectPhantom, signBetCommitment, shortKey, anchorOnDevnet } from "../../lib/phantom";
import { encodeBet } from "../../lib/bet-codec";
import { flag } from "../../lib/flags";
import { encodeXray } from "../../lib/xray-codec";

interface SlipLeg extends Leg {
  sub: string;
  matched: boolean;
}

const DEMO_SLIP: SlipLeg[] = [
  { fixtureId: "wc-qf1", marketId: "home_win", label: "France to beat Brazil", sub: "QF · Match result", bookiePrice: 2.25, fairPrice: 2.42, proofRef: "sol:qf1hw…7c", matched: true },
  { fixtureId: "wc-qf2", marketId: "home_win", label: "England to beat Argentina", sub: "QF · Match result", bookiePrice: 2.6, fairPrice: 2.85, proofRef: "sol:qf2hw…7c", matched: true },
  { fixtureId: "wc-sf1", marketId: "btts", label: "France v Spain · BTTS", sub: "SF · Both teams to score", bookiePrice: 1.8, fairPrice: 1.92, proofRef: "sol:sf1bt…7c", matched: true },
  { fixtureId: "wc-sf1", marketId: "over_corners", label: "France v Spain · Over 9.5 corners", sub: "SF · Corners", bookiePrice: 1.87, fairPrice: 2.02, proofRef: "sol:sf1co…7c", matched: true },
];

export default function Page() {
  const [step, setStep] = useState(0);
  const [slip, setSlip] = useState<SlipLeg[]>([]);
  const [accaOverride, setAccaOverride] = useState<number | null>(null);
  const [splash, setSplash] = useState(true);
  const [anchor, setAnchor] = useState<{ sig?: string; error?: string; busy?: boolean } | null>(null);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [stake, setStake] = useState(10);
  const [wallet, setWallet] = useState<string | null>(null);
  const [live, setLive] = useState<{ configured: boolean; network?: string }>({ configured: false });
  const [betSig, setBetSig] = useState<string | null>(null);
  const [scanOn, setScanOn] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const [betGroups, setBetGroups] = useState<any[]>([]);
  const [activeGroup, setActiveGroup] = useState(0);
  const [slipLoading, setSlipLoading] = useState(true);
  const [board, setBoard] = useState<any[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { txStatus().then(setLive); }, []);

  useEffect(() => {
    fetch("/api/live-slip")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.live && d.legs?.length) {
          setSlip(d.legs.map((l: any) => ({ ...l, fairPrice: l.fairPrice ?? 0 })));
          setAccaOverride(null);
        }
      })
      .catch(() => {})
      .finally(() => setSlipLoading(false));
    fetch("/api/market-board").then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.live) setBoard(d.fixtures); }).catch(() => {});
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) { setSplash(false); return; }
    const t = setTimeout(() => setSplash(false), 2900);
    return () => clearTimeout(t);
  }, []);

  const matchedLegs = useMemo(() => slip.filter((l) => l.matched && l.fairPrice), [slip]);
  const legsForEngine = useMemo(
    () => matchedLegs.map((l) => ({ ...l, bookiePrice: l.bookiePrice > 1 ? l.bookiePrice : l.fairPrice })),
    [matchedLegs]
  );
  const legsProduct = useMemo(
    () => matchedLegs.reduce((a, l) => a * l.bookiePrice, 1),
    [matchedLegs]
  );
  const accaPrice = accaOverride ?? Number(legsProduct.toFixed(2));
  const r = useMemo(
    () => (legsForEngine.length ? xray(legsForEngine, accaPrice, stake) : null),
    [legsForEngine, accaPrice, stake]
  );
  const [chosen, setChosen] = useState<number | null>(null);
  const worst = r ? matchedLegs[chosen ?? r.worstLegIndex] : null;
  const settled = "won";
  const events = [
    { min: 34, type: "yellow", detail: "Yellow · De Paul (ARG)" },
    { min: 58, type: "goal", detail: "GOAL 0–1 · Enzo Fernandez (ARG)" },
    { min: 74, type: "goal", detail: "GOAL 1–1 · Gordon (ENG)" },
    { min: 91, type: "goal", detail: "GOAL 1–2 · L. Martinez header (ARG)" },
  ];

  const addLeg = (fixtureId: string, marketId: string, line: number | undefined, label: string, fair: number) => {
    const key = `${fixtureId}:${marketId}:${line ?? ""}`;
    setSlip((s) => {
      if (s.some((l) => `${l.fixtureId}:${l.marketId}:${(l as any).line ?? ""}` === key)) return s;
      const cleaned = s.filter((l) => l.matched);
      return [...cleaned, {
        fixtureId, marketId, line, label, ko: (board?.find((f: any) => f.fixtureId === fixtureId)?.startTime) ?? null,
        sub: `LIVE · fair ${fair.toFixed(2)} · from market board`,
        bookiePrice: Number((fair * 0.94).toFixed(2)), fairPrice: fair,
        proofRef: "tx:board", matched: true,
      } as any];
    });
    setAccaOverride(null);
  };

  const shareText = async (text: string, url: string) => {
    try {
      if (navigator.share) { await navigator.share({ title: "Fairline", text, url }); return true; }
    } catch {}
    try { await navigator.clipboard.writeText(`${text} ${url}`); return "copied"; } catch { return false; }
  };
  const [shared, setShared] = useState<string | null>(null);

  const legKey = (l: any) => `${l.fixtureId}:${l.marketId}:${l.line ?? ""}:${l.label}`;
  const updateLegPrice = (key: string, v: number) =>
    setSlip((s) => s.map((l) => (legKey(l) === key ? { ...l, bookiePrice: v } : l)));
  const removeLeg = (key: string) =>
    setSlip((s) => s.filter((l) => legKey(l) !== key));

  const runScan = () => {
    if (!r) return;
    setStep(1); setScanOn(false); setTimeout(() => setScanOn(true), 60);
  };

  const deriveLegPrices = (legs: any[], comboPrice: number | null) => {
    if (!comboPrice || comboPrice <= 1) return legs;
    const priced = legs.filter((l) => l.matched && l.fairPrice && l.bookiePrice > 1);
    const unpriced = legs.filter((l) => l.matched && l.fairPrice && !(l.bookiePrice > 1));
    if (!unpriced.length) return legs;
    if (priced.length) return legs; // mixed group: don't guess, split handles it
    const fairProd = unpriced.reduce((a, l) => a * l.fairPrice, 1);
    const base = comboPrice / fairProd;
    if (base <= 0) return legs;
    const k = Math.pow(base, 1 / unpriced.length);
    return legs.map((l) =>
      l.matched && l.fairPrice && !(l.bookiePrice > 1)
        ? { ...l, bookiePrice: Number((l.fairPrice * k).toFixed(2)) }
        : l
    );
  };

  const loadGroup = (g: any) => {
    const legs: SlipLeg[] = (g.legs ?? []).map((l: any) => ({
      fixtureId: l.fixtureId ?? "unmatched",
      marketId: l.marketId,
      line: l.line ?? undefined,
      label: l.selection || `${l.homeTeam} v ${l.awayTeam}`,
      sub: l.matched
        ? `${l.homeTeam} v ${l.awayTeam} · fair ${Number(l.fairPrice).toFixed(2)}`
        : "No fair price available for this market yet",
      bookiePrice: l.bookiePrice ?? 0,
      priceRead: l.bookiePrice != null,
      fairPrice: l.fairPrice ?? 0,
      proofRef: l.proofRef ?? undefined,
      matched: l.matched,
      ko: l.ko ?? null,
    } as any));
    setSlip(deriveLegPrices(legs, g.comboPrice ?? null));
    setAccaOverride(g.comboPrice ?? null);
    if (g.stake) setStake(g.stake);
  };

  const onFile = async (f: File) => {
    setScanning(true); setScanMsg(null);
    try {
      const b64 = await new Promise<string>((res, rej) => {
        const rd = new FileReader();
        rd.onload = () => res((rd.result as string).split(",")[1]);
        rd.onerror = () => rej(new Error("read failed"));
        rd.readAsDataURL(f);
      });
      const resp = await fetch("/api/parse-slip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: b64, mediaType: f.type || "image/png" }),
      });
      const data = await resp.json();
      if (!resp.ok) { setScanMsg(data.error ?? "Could not read that slip · try a clearer screenshot."); return; }
      if (Array.isArray(data.bets) && data.bets.length > 1) {
        setBetGroups(data.bets);
        setActiveGroup(0);
        loadGroup(data.bets[0]);
        setScanMsg(`Read ${data.bets.length} bets · ${data.bets.map((b: any) => b.label).join(" · ")}`);
        return;
      }
      const legs: SlipLeg[] = (data.legs ?? []).map((l: any) => ({
        fixtureId: l.fixtureId ?? "unmatched",
        marketId: l.marketId,
        label: l.selection || `${l.homeTeam} v ${l.awayTeam}`,
        sub: l.matched
          ? `${l.homeTeam} v ${l.awayTeam} · fair ${Number(l.fairPrice).toFixed(2)}`
          : "No fair price available for this market yet",
        bookiePrice: l.bookiePrice ?? 0,
        priceRead: l.bookiePrice != null,
        fairPrice: l.fairPrice ?? 0,
        proofRef: l.proofRef ?? undefined,
        matched: l.matched,
        ko: l.ko ?? null,
      }));
      if (!legs.length) { setScanMsg("No legs found on that image."); return; }
      setSlip(deriveLegPrices(legs, data.accaPrice ?? null));
      setAccaOverride(data.accaPrice ?? null);
      if (data.stake) setStake(data.stake);
      setScanMsg(`Read ${legs.length} legs · ${data.matchedCount} matched to TxLINE markets.`);
    } catch {
      setScanMsg("Scan failed · check connection and try again.");
    } finally {
      setScanning(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="wrap">
      {splash && (
        <div className="splash" onClick={() => setSplash(false)}>
          <div className="wordmark">
            {"FAIRLINE".split("").map((c, i) => (
              <span key={i} className="l" style={{ animationDelay: `${i * 0.05}s`, color: i > 3 ? "var(--margin)" : undefined }}>{c}</span>
            ))}
            <span className="sweep" />
            <span className="tag">KNOW WHAT YOUR BET IS REALLY WORTH</span>
          </div>
        </div>
      )}
      <div className="brand">
        <h1><a href="/" style={{ color: "inherit", textDecoration: "none" }}>FAIR<b>LINE</b></a></h1>
        <div className="net">
          <a href={process.env.NEXT_PUBLIC_FAIRPLAY_URL ?? "#"} style={{ color: "var(--dim)", textDecoration: "none" }}>FAIRPLAY ↗</a>{" · "}{live.configured ? "LIVE ODDS · VERIFIED" : "DEMO MODE"}
          {" · "}
          <a href="#" onClick={(e) => { e.preventDefault(); connectPhantom().then(setWallet); }}
             style={{ color: wallet ? "var(--won)" : "var(--dim)", textDecoration: "none" }}>
            {wallet ? shortKey(wallet) : "CONNECT PHANTOM"}
          </a>
        </div>
      </div>

      <div className="layout">
      <div>
      <div className="steps">
        {["1 · SLIP", "2 · X-RAY", "3 · FAIR BET"].map((t, i) => (
          <button key={t} className={step === i ? "on" : ""} onClick={() => (i === 1 ? runScan() : setStep(i))}>{t}</button>
        ))}
      </div>

      {step === 0 && (
        <section>
          <p className="eyebrow">{slip[0]?.sub?.startsWith("LIVE") ? "Step 1 · Your bet · live World Cup markets" : "Step 1 · Your bet"}</p>
          <p className="foot" style={{ textAlign: "left", margin: "0 2px 12px", color: "var(--dim)" }}>
            Bookies bake hidden margin into every price. Build a slip below or scan yours · we&rsquo;ll show what you&rsquo;re really paying.
          </p>
          <label className={`scandrop ${scanning ? "busy" : ""}`}>
            {scanning ? "READING YOUR SLIP…" : "SCAN BET SLIP · UPLOAD A SCREENSHOT"}
            <small>bet365 · SkyBet · Ladbrokes · Paddy Power · any bookie</small>
            <input ref={fileRef} type="file" accept="image/*" hidden disabled={scanning}
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          </label>
          {scanMsg && <p className="foot" style={{ marginTop: 0, marginBottom: 12 }}>{scanMsg}</p>}
          {slip.some((l: any) => l.matched && !(l.bookiePrice > 1)) && (
            <p className="foot" style={{ margin: "0 2px 12px", textAlign: "left", color: "var(--dim)" }}>
              Builders don&rsquo;t print leg prices. The combo X-rays as one bet; add leg prices from the singles view only if you want a per-leg breakdown.
            </p>
          )}
          {betGroups.length > 1 && (
            <div className="mkrow" style={{ marginBottom: 12, flexWrap: "wrap" }}>
              {betGroups.map((g, i) => (
                <button key={i} className="mkpx"
                  style={i === activeGroup ? { borderColor: "var(--margin)", color: "var(--margin)" } : {}}
                  onClick={() => { setActiveGroup(i); loadGroup(g); }}>
                  {g.label} · {g.matchedCount}/{g.legs.length} priced
                </button>
              ))}
            </div>
          )}
          {!slipLoading && slip.length === 0 && (
            <div className="card" style={{ textAlign: "center", padding: "30px 16px" }}>
              <span style={{ fontFamily: "var(--mono)", fontSize: 11, letterSpacing: ".1em", color: "var(--dim)" }}>
                SCAN A SLIP OR TAP A LIVE PRICE ON THE BOARD →
              </span>
            </div>
          )}
          {slipLoading && (
            <div className="card" style={{ textAlign: "center", padding: "34px 16px" }}>
              <span style={{ fontFamily: "var(--mono)", fontSize: 11, letterSpacing: ".14em", color: "var(--margin)" }}>
                LOADING LIVE ODDS…
              </span>
            </div>
          )}
          {!slipLoading && slip.length > 0 && <div className="card">
            {slip.map((l, i) => (
              <div className={`leg ${l.matched ? "" : "unmatched"}`} key={`${l.label}-${i}`}>
                <div className="m">{l.label}<span>{l.sub}</span></div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input className="num" type="number" step="0.01"
                    style={{ width: 92, flex: "none" }}
                    value={l.bookiePrice > 0 ? l.bookiePrice : ""}
                    placeholder="combo"
                    disabled={!l.matched}
                    onChange={(e) =>
                      setSlip(slip.map((s, j) => (j === i ? { ...s, bookiePrice: +e.target.value || 0 } : s)))
                    } />
                  <button className="mkpx" style={{ padding: "4px 9px", flex: "none" }} title="Remove leg"
                    onClick={() => setSlip(slip.filter((_, j) => j !== i))}>×</button>
                </div>
              </div>
            ))}
            <div className="totrow">
              <label>Bookie&rsquo;s acca price
                <button className={`autochip ${accaOverride === null ? "on" : ""}`}
                  onClick={() => setAccaOverride(null)}
                  title="AUTO: the acca price recalculates as your leg prices multiplied. Scanning a slip locks the bookie printed combo price instead. Click to snap back to the calculated product.">
                  {accaOverride === null ? "AUTO ✓" : "RESET TO AUTO"}
                </button>
              </label>
              <input className="num" type="number" step="0.01" value={accaPrice}
                onChange={(e) => setAccaOverride(+e.target.value || null)} /></div>
            <div className="totrow"><label>Stake (£)</label>
              <input className="num" type="number" step="1" value={stake} onChange={(e) => setStake(+e.target.value || stake)} /></div>
            <button className="go" onClick={runScan} disabled={!r}>RUN X-RAY →</button>
          </div>}
          <p className="foot">Scan a slip or edit prices by hand.<br />Fair odds verified by TxODDS.</p>
        </section>
      )}

      {step === 1 && r && (
        <section>
          <div className="card verdict">
            <p className="eyebrow" style={{ marginLeft: 0 }}>Margin X-ray · prices as of {new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</p>
            <div className="big">{r.accaMarginPct.toFixed(1)}<small>%</small></div>
            <p>is what this acca charges you above the verified fair price.<br />
              <b>£{stake.toFixed(0)} staked → expected value −£{Math.abs(r.expectedValueAbs).toFixed(2)}.</b></p>
            <div className="mkrow" style={{ margin: "12px 0 2px", alignItems: "center" }}>
              <span className="mklabel" style={{ width: "auto" }}>THEIR ACCA</span>
              <input className="num" type="number" step="0.01" value={accaPrice}
                style={{ width: 84, padding: "5px 7px" }}
                onChange={(e) => setAccaOverride(+e.target.value || null)} />
              <button className={`autochip ${accaOverride === null ? "on" : ""}`}
                title="AUTO: recalculates as your leg prices multiplied. Click to snap back."
                onClick={() => setAccaOverride(null)}>{accaOverride === null ? "AUTO ✓" : "RESET TO AUTO"}</button>
              <span className="mklabel" style={{ width: "auto", marginLeft: 10 }}>STAKE £</span>
              <input className="num" type="number" step="1" value={stake}
                style={{ width: 64, padding: "5px 7px" }}
                onChange={(e) => setStake(Math.max(1, +e.target.value || 1))} />
            </div>
            <div className="kv">
              <div><div className="k">Their price</div><div className="v">{r.accaBookiePrice.toFixed(2)}</div></div>
              <div><div className="k">Fair price</div><div className="v">{r.accaFairPrice.toFixed(2)}</div></div>
              <div><div className="k">EV / £{stake.toFixed(0)}</div><div className="v neg">−£{Math.abs(r.expectedValueAbs).toFixed(2)}</div></div>
            </div>
          </div>
          <p className="eyebrow">Per-leg scan</p>
          <div className="card">
            {r.legs.map((l, i) => {
              const fairW = l.fairProb * 100;
              const skimW = (l.bookieImpliedProb - l.fairProb) * 100;
              return (
                <div className="scanleg" key={`${l.label}-${i}`}>
                  <div className="top">
                    <div className={`lbl ${i === r.worstLegIndex ? "worst" : ""}`}>{l.label}{i === r.worstLegIndex ? " ← worst leg" : ""}</div>
                    <div className="pm">+{l.marginPct.toFixed(1)}%</div>
                  </div>
                  <div className="bar">
                    <div className="fair" style={{ width: scanOn ? `${fairW}%` : 0 }} />
                    <div className="skim" style={{ left: `${fairW}%`, width: scanOn ? `${Math.max(skimW, 0)}%` : 0 }} />
                  </div>
                  <div className="sub" style={{ alignItems: "center" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      theirs
                      <input className="num" type="number" step="0.01" value={l.bookiePrice}
                        style={{ width: 64, padding: "3px 5px", fontSize: 11 }}
                        onChange={(e) => updateLegPrice(legKey(l), +e.target.value || 0)} />
                      · fair {l.fairPrice.toFixed(2)}
                      <button className="mkpx" style={{ padding: "2px 7px", fontSize: 10 }} title="Remove leg"
                        onClick={() => removeLeg(legKey(l))}>×</button>
                    </span>
                    <a href="#" onClick={(e) => e.preventDefault()}>verified ↗</a></div>
                </div>
              );
            })}
          </div>
          {matchedLegs.some((l) => !(l.bookiePrice > 1)) && (
            <div className="card" style={{ marginTop: 12 }}>
              {matchedLegs.filter((l) => !(l.bookiePrice > 1)).map((l, i) => (
                <div className="scanleg" key={`np-${i}`}>
                  <div className="top">
                    <div className="lbl">{l.label}</div>
                    <div className="pm" style={{ color: "var(--dim)" }}>IN COMBO</div>
                  </div>
                  <div className="sub"><span>fair {l.fairPrice.toFixed(2)} · leg price not printed on the slip</span></div>
                </div>
              ))}
            </div>
          )}
          {slip.some((l) => !l.matched) && (
            <div className="card" style={{ marginTop: 12 }}>
              {slip.filter((l) => !l.matched).map((l, i) => (
                <div className="scanleg unmatched" key={`x-${i}`}>
                  <div className="top">
                    <div className="lbl">{l.label}</div>
                    <div className="pm" style={{ color: "var(--faint)" }}>EXCLUDED</div>
                  </div>
                  <div className="sub"><span>No fair price available for this market yet</span></div>
                </div>
              ))}
            </div>
          )}
          <div className="legend">
            <span><span className="sw" style={{ background: "#2E4160" }} />FAIR PRICE</span>
            <span><span className="sw" style={{ background: "repeating-linear-gradient(-55deg,var(--margin) 0 3px,transparent 3px 6px)" }} />MARGIN SKIMMED</span>
          </div>
          <div style={{ height: 16 }} />
          <button className="cta" onClick={() => setStep(2)}>TAKE WORST LEG AT FAIR ODDS ON FAIRPLAY →</button>
          <button className="go" style={{ marginTop: 10 }} onClick={async () => {
            const cardUrl = `${window.location.origin}/x?d=${encodeXray({
              v: 1, acca: r.accaBookiePrice, stake,
              legs: slip.map((l) => ({ label: l.label, bookie: l.bookiePrice, fair: l.fairPrice, matched: l.matched })),
            })}`;
            const t = `Check how much extra the bookies are charging me: ${r.accaMarginPct.toFixed(1)}% over the verified fair price on this slip. X-rayed on Fairline:`;
            const res = await shareText(t, cardUrl);
            setShared(res === "copied" ? "COPIED TO CLIPBOARD ✓" : res ? "SHARED ✓" : null);
            setTimeout(() => setShared(null), 2200);
          }}>{shared ?? "SHARE MY X-RAY"}</button>
          <p className="foot">Every fair price is independently verifiable.<br />Nothing here is our opinion.</p>
        </section>
      )}

      {step === 2 && worst && (
        <section>
          <p className="eyebrow">FairPlay · pick a leg, post it at the fair price</p>
          {matchedLegs.length > 1 && (
            <div className="mkrow" style={{ marginBottom: 10, flexWrap: "wrap" }}>
              {matchedLegs.map((l, i) => (
                <button key={i} className="mkpx"
                  style={i === (chosen ?? r!.worstLegIndex) ? { borderColor: "var(--margin)", color: "var(--margin)" } : {}}
                  onClick={() => setChosen(i)}>{l.label.slice(0, 24)} · {l.fairPrice.toFixed(2)}</button>
              ))}
            </div>
          )}
          <div className="card chal">
            <div className="row"><span className="k">Market</span><span className="v">{worst.label.split("·").pop()?.trim()}</span></div>
            <div className="row"><span className="k">Your price (fair)</span><span className="v">{worst.fairPrice.toFixed(2)}</span></div>
            <div className="row"><span className="k">Bookie wanted</span><span className="v" style={{ color: "var(--faint)", textDecoration: "line-through" }}>{worst.bookiePrice.toFixed(2)}</span></div>
            <div className="row"><span className="k">Stake</span><span className="v">£{stake.toFixed(2)}</span></div>
            <div className="row"><span className="k">Settlement</span><span className="v" style={{ fontSize: 11 }}>Automatic · official result</span></div>
            <div className="row"><span className="k">Status</span>
              <span className={`pill ${betSig ? "won" : "open"}`}>{betSig ? "LIVE ON FAIRPLAY BOARD · AWAITING TAKER" : "AWAITING YOUR SIGNATURE"}</span></div>
            {!betSig && (
              <button className="go" style={{ marginTop: 12 }} onClick={async () => {
                const sig = await signBetCommitment({
                  app: "fairline", v: 1, market: worst.marketId, fixture: worst.fixtureId,
                  price: worst.fairPrice, stake, side: "for", ts: Date.now(),
                });
                if (sig) setBetSig(sig);
              }}>
                {wallet ? "SIGN CHALLENGE WITH PHANTOM" : "CONNECT PHANTOM TO SIGN"}
              </button>
            )}
            {betSig && <div className="proofbox" style={{ marginTop: 12 }}><b>SIGNED WITH YOUR WALLET ✓</b></div>}
            {shareLink && (
              <a href={process.env.NEXT_PUBLIC_FAIRPLAY_URL ?? "#"} target="_blank" rel="noreferrer" className="cta"
                 style={{ marginTop: 10, display: "block", textAlign: "center", textDecoration: "none" }}>
                VIEW IT ON THE FAIRPLAY BOARD ↗
              </a>
            )}
            {shareLink && (
              <button className="go" style={{ marginTop: 10 }}
                onClick={() => { navigator.clipboard.writeText(shareLink); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>
                {copied ? "LINK COPIED ✓" : "COPY CHALLENGE LINK →"}
              </button>
            )}
            {shareLink && (
              <button className="cta" style={{ marginTop: 8 }} onClick={async () => {
                const t = `Take the other side: ${worst.label} @ fair ${worst.fairPrice.toFixed(2)}, £10. Settled by TxODDS verified data on Fairline.`;
                const res = await shareText(t, shareLink);
                setShared(res === "copied" ? "COPIED ✓" : res ? "SHARED ✓" : null);
                setTimeout(() => setShared(null), 2200);
              }}>{shared ?? "SHARE CHALLENGE TO SOCIALS →"}</button>
            )}
            {betSig && !anchor?.sig && (
              <button className="cta" style={{ marginTop: 10 }} disabled={anchor?.busy}
                onClick={async () => {
                  setAnchor({ busy: true });
                  const res = await anchorOnDevnet({
                    app: "fairline", market: worst.marketId, fixture: worst.fixtureId,
                    price: worst.fairPrice, commit: betSig.slice(0, 32),
                  });
                  setAnchor(res as any);
                }}>
                {anchor?.busy ? "RECORDING…" : "RECORD BET ON-CHAIN →"}
              </button>
            )}
            {anchor?.error && <p className="foot" style={{ color: "var(--lost)", marginTop: 8 }}>{anchor.error}</p>}
            {anchor?.sig && (
              <div className="proofbox" style={{ marginTop: 10 }}>
                <b>RECORDED ON-CHAIN ✓</b><br />
                tx: {anchor.sig.slice(0, 40)}…<br />
                <a href={`https://explorer.solana.com/tx/${anchor.sig}?cluster=devnet`} target="_blank" rel="noreferrer"
                   style={{ color: "var(--won)" }}>view proof ↗</a>
              </div>
            )}
          </div>

                    <p className="foot">Abandoned or postponed match? Rule-based VOID,<br />stakes returned, certificate issued. No disputes.</p>
        </section>
      )}
      </div>
      <div className="boardcol">
        <p className="eyebrow">Live TxLINE markets · tap a price to add</p>
        <div className="card">
          {!board && <p className="mknote">CONNECTING TO FEED…</p>}
          {board?.map((f: any) => {
            const ko = new Date(f.startTime).toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
            return (
              <div className="mkfix" key={f.fixtureId}>
                <div className="mkhead"><div>{f.home} v {f.away}</div><span>KO {ko}</span></div>
                <div className="mkrow">
                  <span className="mklabel">RESULT</span>
                  {f.oneX2.home && <button className="mkpx" onClick={() => addLeg(f.fixtureId, "home_win", undefined, `${f.home} to beat ${f.away}`, f.oneX2.home)}><small>{flag(f.home)}</small>{f.oneX2.home.toFixed(2)}</button>}
                  {f.oneX2.draw && <button className="mkpx" onClick={() => addLeg(f.fixtureId, "draw", undefined, `${f.home} v ${f.away} · Draw`, f.oneX2.draw)}><small>X</small>{f.oneX2.draw.toFixed(2)}</button>}
                  {f.oneX2.away && <button className="mkpx" onClick={() => addLeg(f.fixtureId, "away_win", undefined, `${f.away} to beat ${f.home}`, f.oneX2.away)}><small>{flag(f.away)}</small>{f.oneX2.away.toFixed(2)}</button>}
                </div>
                {f.goals.filter((g: any) => g.over || g.under).slice(0, 4).map((g: any) => (
                  <div className="mkrow" key={`g${g.line}`}>
                    <span className="mklabel">GOALS {g.line}</span>
                    {g.over && <button className="mkpx" onClick={() => addLeg(f.fixtureId, "over_goals", g.line, `${f.home} v ${f.away} · Over ${g.line} goals`, g.over)}><small>O</small>{g.over.toFixed(2)}</button>}
                    {g.under && <button className="mkpx" onClick={() => addLeg(f.fixtureId, "under_goals", g.line, `${f.home} v ${f.away} · Under ${g.line} goals`, g.under)}><small>U</small>{g.under.toFixed(2)}</button>}
                  </div>
                ))}
                {f.handicap.filter((h: any) => h.home || h.away).slice(0, 4).map((h: any) => (
                  <div className="mkrow" key={`h${h.line}`}>
                    <span className="mklabel">AH {h.line}</span>
                    {h.home && <button className="mkpx" onClick={() => addLeg(f.fixtureId, "home_handicap", h.line, `${f.home} ${h.line >= 0 ? "+" : ""}${h.line} v ${f.away}`, h.home)}><small>{flag(f.home)}</small>{h.home.toFixed(2)}</button>}
                    {h.away && <button className="mkpx" onClick={() => addLeg(f.fixtureId, "away_handicap", -h.line, `${f.away} ${-h.line >= 0 ? "+" : ""}${-h.line} v ${f.home}`, h.away)}><small>{flag(f.away)}</small>{h.away.toFixed(2)}</button>}
                  </div>
                ))}
              </div>
            );
          })}
          <p className="mknote">Fair odds by TxODDS<br />Match result · total goals · handicaps<br />More markets coming</p>
        </div>
      </div>
      </div>
    </div>
  );
}
