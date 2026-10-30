import { useEffect, useRef, useState } from "react";
import { useMediaQuery } from "@/hooks/use-media-query";
import { formatMoney } from "@/lib/format";
import { moneyToNumber } from "@/lib/money";
import { cn } from "@/lib/utils";
import { countUpValue } from "./model";

const DURATION_MS = 900;

/**
 * A whole-kroner amount that counts up from 0 the first time it is shown, then follows the
 * value without animating. The final value reserves the width (stacked underneath, invisible),
 * so nothing moves while the digits roll; screen readers get only the final value. Under
 * reduced motion it shows the value at once.
 */
export function CountUpMoney({ value, className }: { value: string; className?: string }) {
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const target = Math.round(moneyToNumber(value));
  const played = useRef(false);
  const [shown, setShown] = useState(() => (reduced ? target : 0));

  useEffect(() => {
    if (played.current || reduced) {
      setShown(target);
      return;
    }
    let frame = 0;
    let start: number | null = null;
    const step = (time: number) => {
      start ??= time;
      const next = countUpValue(target, time - start, DURATION_MS);
      setShown(next);
      if (next !== target) frame = requestAnimationFrame(step);
      else played.current = true;
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, reduced]);

  return (
    <span className={cn("num inline-grid whitespace-nowrap", className)}>
      <span className="invisible col-start-1 row-start-1" aria-hidden>
        {formatMoney(String(target), { precision: "whole" })}
      </span>
      <span data-slot="count-up" className="col-start-1 row-start-1 text-right" aria-hidden>
        {formatMoney(String(shown), { precision: "whole" })}
      </span>
      <span className="sr-only">{formatMoney(String(target), { precision: "whole" })}</span>
    </span>
  );
}
