/**
 * Real-world map for the board: Natural Earth country shapes (public domain, via the
 * `world-atlas` package) grouped into the game's 8 regions and projected with d3-geo.
 *
 * Region indices are fixed by the contract (territory 0–7 and their adjacency). The names
 * and country groupings are presentation only: the program knows nothing about them.
 */
import { geoNaturalEarth1, geoPath } from "d3-geo";
import type { Feature, Geometry } from "geojson";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import countries110m from "world-atlas/countries-110m.json";

export const MAP_WIDTH = 960;
export const MAP_HEIGHT = 480;

/** Country → region, by ISO 3166-1 numeric code (world-atlas `id`), or by name where it has none. */
const REGION_COUNTRIES: Record<number, (string | number)[]> = {
  // 0 North America
  0: [840, 124, 484, 304, 320, 84, 222, 340, 558, 188, 591, 192, 332, 214, 388, 44, 630, 780],
  // 1 Europe
  1: [
    826, 372, 250, 724, 620, 276, 380, 528, 56, 442, 756, 40, 616, 203, 703, 348, 705, 191, 70, 688, 499, 807, 8, 300, 100, 642, 498, 804,
    112, 440, 428, 233, 246, 752, 578, 208, 352, "Kosovo",
  ],
  // 2 Middle East (with Central Asia, which links it to East Asia)
  2: [792, 760, 368, 364, 682, 887, 512, 784, 634, 414, 400, 376, 422, 275, 196, "N. Cyprus", 268, 51, 31, 398, 860, 795, 417, 762, 4],
  // 3 East Asia (with Southeast Asia)
  3: [156, 496, 408, 410, 392, 158, 764, 704, 418, 116, 458, 360, 608, 96, 626],
  // 4 South America
  4: [76, 32, 152, 604, 170, 862, 218, 68, 600, 858, 328, 740, 238],
  // 5 North Africa (Sahara, Sahel and West Africa)
  5: [504, 12, 788, 434, 818, 732, 729, 478, 466, 562, 148, 686, 270, 324, 624, 694, 430, 384, 854, 288, 768, 204, 566, 232, 262, 231, 706, "Somaliland", 120, 140, 728],
  // 6 South Africa (Central, East and Southern Africa)
  6: [710, 516, 72, 716, 508, 894, 24, 454, 834, 404, 800, 646, 108, 180, 178, 266, 226, 450, 426, 748],
  // 7 India (South Asia)
  7: [356, 586, 50, 524, 64, 144, 104],
};

/**
 * Where each region's tile sits, as [longitude, latitude]. Chosen by a small search over
 * points inside each region so no tile or label overlaps another, even on the smallest
 * board (720px wide).
 */
const ANCHORS: [number, number][] = [
  [-100, 45], // North America
  [5, 55], // Europe (North Sea)
  [54, 42], // Middle East (Caspian; the region includes Central Asia)
  [107, 41], // East Asia
  [-57, -12], // South America
  [-5, 19], // North Africa
  [25, -13], // South Africa
  [82, 10], // India
];

const regionOf = new Map<string | number, number>();
for (const [region, list] of Object.entries(REGION_COUNTRIES)) for (const key of list) regionOf.set(key, Number(region));

type CountryProps = { name: string };
const topology = countries110m as unknown as Topology<{ countries: GeometryCollection<CountryProps> }>;
const all = feature(topology, topology.objects.countries).features as Feature<Geometry, CountryProps>[];
// Antarctica is dropped so the map uses its height for the playable continents.
const shapes = all.filter((f) => f.properties.name !== "Antarctica");

const projection = geoNaturalEarth1().fitExtent(
  [
    [8, 8],
    [MAP_WIDTH - 8, MAP_HEIGHT - 8],
  ],
  { type: "FeatureCollection", features: shapes },
);
const path = geoPath(projection);

export type CountryShape = { key: string; d: string; region: number | null };

/** Every country outline, tagged with its region (null = unclaimed land: Russia, Australia…). */
export const COUNTRY_SHAPES: CountryShape[] = shapes
  .map((f, i) => {
    const byId = f.id !== undefined ? regionOf.get(Number(f.id)) : undefined;
    const region = byId ?? regionOf.get(f.properties.name) ?? null;
    return { key: `${f.id ?? f.properties.name}-${i}`, d: path(f) ?? "", region };
  })
  .filter((s) => s.d);

/** Tile position per region, in map units. */
export const REGION_POINTS: [number, number][] = ANCHORS.map((a) => projection(a) as [number, number]);

/**
 * The part of the projection that is drawn: the land's bounds plus a small margin, so the
 * continents fill the card instead of the empty ocean round the edges.
 */
export const VIEW = { x: 56, y: 26, width: 874, height: 428 };

const toPercent = (x: number, y: number) => ({ x: ((x - VIEW.x) / VIEW.width) * 100, y: ((y - VIEW.y) / VIEW.height) * 100 });

/** Tile position per region, as a percentage of the drawn map box (for HTML overlays). */
export const REGION_PERCENT = REGION_POINTS.map(([x, y]) => toPercent(x, y));

/** A gentle arc between two regions, bowed away from the map's centre, for connectors and arrows. */
export function arcPath(a: number, b: number) {
  const [x1, y1] = REGION_POINTS[a];
  const [x2, y2] = REGION_POINTS[b];
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  // Perpendicular offset, proportional to distance, always bowing upwards.
  let nx = -dy / len;
  let ny = dx / len;
  if (ny > 0) {
    nx = -nx;
    ny = -ny;
  }
  const bow = Math.min(len * 0.18, 60);
  return `M${x1},${y1} Q${mx + nx * bow},${my + ny * bow} ${x2},${y2}`;
}

/** The point halfway along `arcPath(a, b)`, as a percentage of the map box (for labels). */
export function arcMidPercent(a: number, b: number) {
  const [x1, y1] = REGION_POINTS[a];
  const [x2, y2] = REGION_POINTS[b];
  const [, qx, qy] = arcPath(a, b).match(/Q([-\d.e]+),([-\d.e]+)/)!.map(Number);
  // Quadratic Bézier at t = ½: ¼·P0 + ½·Q + ¼·P1.
  const x = 0.25 * x1 + 0.5 * qx + 0.25 * x2;
  const y = 0.25 * y1 + 0.5 * qy + 0.25 * y2;
  return toPercent(x, y);
}
