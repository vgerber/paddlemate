/** The in-trip stretches of a row as [first, last] column pairs. */
export function stretches(flags: boolean[]): [number, number][] {
  const out: [number, number][] = [];
  flags.forEach((on, i) => {
    if (!on) return;
    const last = out[out.length - 1];
    if (last && last[1] === i - 1) last[1] = i;
    else out.push([i, i]);
  });
  return out;
}
