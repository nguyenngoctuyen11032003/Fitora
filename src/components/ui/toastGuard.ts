/**
 * A toast action ("Hoàn tác") must run at most once per toast, even when a double-tap lands
 * while the toast is still fading out (it stays mounted for ~220 ms). Returns true only for
 * the first claim of an id.
 */
export function claimToastAction(fired: Set<number>, id: number): boolean {
  if (fired.has(id)) return false;
  fired.add(id);
  return true;
}
