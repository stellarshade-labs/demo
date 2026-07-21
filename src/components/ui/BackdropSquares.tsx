/**
 * Faint, oversized echoes of the brand's square-and-shadow mark, placed behind
 * full-screen centered columns (onboarding, unlock). Kills the empty-void feel
 * without introducing color or gradients — the identity stays flat graphite.
 */
export function BackdropSquares() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -left-24 top-[10%] size-72 border border-ink-400/[0.07]" />
      <div className="absolute -left-10 top-[16%] size-72 border border-ink-400/[0.04]" />
      <div className="absolute -right-36 bottom-[6%] size-[26rem] border border-ink-400/[0.06]" />
      <div className="absolute -right-20 bottom-[13%] size-[26rem] border border-ink-400/[0.03]" />
      <div className="absolute left-[16%] -bottom-24 size-56 border border-ink-400/[0.05]" />
    </div>
  );
}
