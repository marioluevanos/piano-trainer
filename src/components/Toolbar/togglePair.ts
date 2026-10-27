/**
 * Two toggles of which at least one is always on, as a three-way mode: both,
 * only the first or only the second. `toggled` is the mode after flipping one
 * of them; flipping the only one on changes nothing.
 */
export function togglePair<M extends string>(
  mode: M,
  modes: { first: M; second: M; both: M },
) {
  const firstOn = mode !== modes.second;
  const secondOn = mode !== modes.first;
  const toggled = (which: "first" | "second"): M => {
    const first = which === "first" ? !firstOn : firstOn;
    const second = which === "second" ? !secondOn : secondOn;
    if (first && second) return modes.both;
    if (first) return modes.first;
    if (second) return modes.second;
    return mode;
  };
  return { firstOn, secondOn, toggled };
}
