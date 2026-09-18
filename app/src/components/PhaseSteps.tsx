import type { Auction } from "@/lib/contract";
import { STATE } from "@/lib/contract";
import { useLanguage } from "./Language";

const STEPS = ["Commit", "Random close", "Reveal", "Settled"] as const;

/** Where the auction is in its life: sealed bids → VRF picks the close → reveal → settlement. */
export function PhaseSteps({ a, now }: { a: Auction; now: bigint }) {
  const { zh } = useLanguage();
  const s = STATE[a.state];
  let active = 0;
  if (s === "Committing") active = now > a.p.endBlock ? 1 : 0;
  else if (s === "AwaitingRandomness") active = 1;
  else if (s === "Revealing") active = 2;
  else active = 3;
  const cancelled = s === "Cancelled";
  return (
    <ol className="steps" aria-label="auction phase">
      {(zh ? ["提交", "随机截止", "揭示", "已结算"] : STEPS).map((label, i) => (
        <li key={label} className={i < active ? "done" : i === active ? "active" : ""}>
          <span className="dot" />
          <span className="lbl">{i === 3 && cancelled ? (zh ? "已取消" : "Cancelled") : label}</span>
        </li>
      ))}
    </ol>
  );
}
