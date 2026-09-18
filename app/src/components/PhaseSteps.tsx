import type { Auction } from "@/lib/contract";
import { STATE } from "@/lib/contract";

const STEPS = ["Commit", "Random close", "Reveal", "Settled"] as const;

/** Where the auction is in its life: sealed bids → VRF picks the close → reveal → settlement. */
export function PhaseSteps({ a, now }: { a: Auction; now: bigint }) {
  const s = STATE[a.state];
  let active = 0;
  if (s === "Committing") active = now > a.p.endBlock ? 1 : 0;
  else if (s === "AwaitingRandomness") active = 1;
  else if (s === "Revealing") active = 2;
  else active = 3;
  const cancelled = s === "Cancelled";
  return (
    <ol className="steps" aria-label="auction phase">
      {STEPS.map((label, i) => (
        <li key={label} className={i < active ? "done" : i === active ? "active" : ""}>
          <span className="dot" />
          <span className="lbl">{i === 3 && cancelled ? "Cancelled" : label}</span>
        </li>
      ))}
    </ol>
  );
}
