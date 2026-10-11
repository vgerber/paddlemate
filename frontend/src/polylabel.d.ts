declare module "polylabel" {
  /** Pole of inaccessibility of a polygon (outer ring first, then holes). */
  export default function polylabel(
    polygon: number[][][],
    precision?: number,
    debug?: boolean,
  ): [number, number] & { distance: number };
}
