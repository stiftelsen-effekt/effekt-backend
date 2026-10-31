/**
 * The value after a click on the track: the mean moves to the clicked position (clamped to the
 * track) and the standard deviation is kept.
 */
export const meanFromTrackClick = (
  clientX: number,
  rect: { left: number; width: number },
  min: number,
  max: number,
  value: { mean: number; stdv: number },
): { mean: number; stdv: number } => {
  if (rect.width <= 0) return value;
  const x = Math.min(Math.max(0, clientX - rect.left), rect.width);
  return { mean: min + (x / rect.width) * (max - min), stdv: value.stdv };
};
