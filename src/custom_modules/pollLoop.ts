/**
 *
 * @param {string} id Resource ID
 * @param {function} fn Function that does the polling. Returns true if polling should stop.
 * @param {number} interval Interval between polls
 * @param {number} count The count of how many times we've polled
 */
export async function pollLoop(
  fn: (polls: number) => Promise<boolean> | boolean,
  interval: number,
  count = 1,
) {
  const shouldCancel = await fn(count);
  if (!shouldCancel) {
    await new Promise((resolve) => setTimeout(resolve, interval));
    await this.pollLoop(fn, interval, count + 1);
  }
}
