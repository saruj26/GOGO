/**
 * Geographic primitives.
 *
 * The AUTHORITATIVE corridor/ordering computations for shared-ride matching run
 * inside PostgreSQL via PostGIS (see MatchingRepository) so they use the same
 * geodesic maths as the GiST index that shortlists candidates. The pure
 * TypeScript implementations here exist for three narrower purposes:
 *   - decoding/encoding provider polylines,
 *   - converting geometry to WKT for parameterised raw SQL,
 *   - deterministic unit testing of the matching rules without a database.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_M = 6_371_008.8; // IUGG mean radius
const DEG_TO_RAD = Math.PI / 180;

export function isValidLatLng(p: LatLng): boolean {
  return (
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng) &&
    p.lat >= -90 &&
    p.lat <= 90 &&
    p.lng >= -180 &&
    p.lng <= 180
  );
}

/** Great-circle distance in metres. */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = (b.lat - a.lat) * DEG_TO_RAD;
  const dLng = (b.lng - a.lng) * DEG_TO_RAD;
  const lat1 = a.lat * DEG_TO_RAD;
  const lat2 = b.lat * DEG_TO_RAD;

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial bearing from `a` to `b`, degrees clockwise from north (0..360). */
export function bearingDegrees(a: LatLng, b: LatLng): number {
  const lat1 = a.lat * DEG_TO_RAD;
  const lat2 = b.lat * DEG_TO_RAD;
  const dLng = (b.lng - a.lng) * DEG_TO_RAD;

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (Math.atan2(y, x) / DEG_TO_RAD + 360) % 360;
}

/** Smallest absolute difference between two bearings, 0..180. */
export function bearingDifference(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

/** Cumulative length of a path in metres. */
export function pathLengthMeters(path: readonly LatLng[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i += 1) {
    total += haversineMeters(path[i - 1], path[i]);
  }
  return total;
}

interface Projection {
  /** Distance from the point to the nearest point on the path, in metres. */
  distanceMeters: number;
  /** Position along the path as a fraction of total length, 0..1. */
  fraction: number;
  /** The nearest point itself. */
  point: LatLng;
  /** Index of the path segment the projection fell on. */
  segmentIndex: number;
}

/**
 * Projects a point onto a polyline. Each segment is treated as straight in a
 * local equirectangular frame, which is accurate to well under a metre at the
 * segment lengths route providers emit.
 */
export function projectPointOntoPath(point: LatLng, path: readonly LatLng[]): Projection {
  if (path.length === 0) {
    throw new Error('Cannot project onto an empty path');
  }
  if (path.length === 1) {
    return {
      distanceMeters: haversineMeters(point, path[0]),
      fraction: 0,
      point: path[0],
      segmentIndex: 0,
    };
  }

  // Segment lengths, so the projection can be reported as a fraction of total.
  const segmentLengths: number[] = [];
  let totalLength = 0;
  for (let i = 1; i < path.length; i += 1) {
    const len = haversineMeters(path[i - 1], path[i]);
    segmentLengths.push(len);
    totalLength += len;
  }

  const cosLat = Math.cos(point.lat * DEG_TO_RAD);
  const toXY = (p: LatLng) => ({ x: p.lng * cosLat, y: p.lat });
  const target = toXY(point);

  let best: Projection = {
    distanceMeters: Number.POSITIVE_INFINITY,
    fraction: 0,
    point: path[0],
    segmentIndex: 0,
  };
  let travelled = 0;

  for (let i = 0; i < path.length - 1; i += 1) {
    const a = path[i];
    const b = path[i + 1];
    const pa = toXY(a);
    const pb = toXY(b);

    const dx = pb.x - pa.x;
    const dy = pb.y - pa.y;
    const denom = dx * dx + dy * dy;

    // t is the clamped position of the perpendicular foot along the segment.
    const t =
      denom === 0
        ? 0
        : Math.max(
            0,
            Math.min(1, ((target.x - pa.x) * dx + (target.y - pa.y) * dy) / denom),
          );

    const nearest: LatLng = { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
    const distance = haversineMeters(point, nearest);

    if (distance < best.distanceMeters) {
      const along = travelled + segmentLengths[i] * t;
      best = {
        distanceMeters: distance,
        fraction: totalLength === 0 ? 0 : along / totalLength,
        point: nearest,
        segmentIndex: i,
      };
    }
    travelled += segmentLengths[i];
  }

  return best;
}

/**
 * Decodes a Google/Mapbox encoded polyline.
 * @param precision 5 for Google Directions, 6 for OSRM's default.
 */
export function decodePolyline(encoded: string, precision = 5): LatLng[] {
  const factor = 10 ** precision;
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte: number;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push({ lat: lat / factor, lng: lng / factor });
  }

  return points;
}

/** Encodes a path as a Google-style polyline. */
export function encodePolyline(path: readonly LatLng[], precision = 5): string {
  const factor = 10 ** precision;
  let output = '';
  let prevLat = 0;
  let prevLng = 0;

  const encodeValue = (value: number): string => {
    let v = value < 0 ? ~(value << 1) : value << 1;
    let chunk = '';
    while (v >= 0x20) {
      chunk += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
      v >>= 5;
    }
    chunk += String.fromCharCode(v + 63);
    return chunk;
  };

  for (const p of path) {
    const lat = Math.round(p.lat * factor);
    const lng = Math.round(p.lng * factor);
    output += encodeValue(lat - prevLat);
    output += encodeValue(lng - prevLng);
    prevLat = lat;
    prevLng = lng;
  }

  return output;
}

/**
 * Renders a path as WKT for use as a *bound parameter* in raw SQL.
 * Coordinates are emitted as plain numbers after a finite check, so this cannot
 * be used as an injection vector even though the result is textual.
 */
export function pathToWkt(path: readonly LatLng[]): string {
  if (path.length < 2) {
    throw new Error('A LineString requires at least two points');
  }
  const coords = path
    .map((p) => {
      if (!isValidLatLng(p)) {
        throw new Error('Invalid coordinate in path');
      }
      return `${p.lng} ${p.lat}`;
    })
    .join(',');
  return `LINESTRING(${coords})`;
}

export function pointToWkt(p: LatLng): string {
  if (!isValidLatLng(p)) {
    throw new Error('Invalid coordinate');
  }
  return `POINT(${p.lng} ${p.lat})`;
}

/**
 * Removes consecutive duplicate points, which some providers emit and which
 * make ST_LineLocatePoint ambiguous.
 */
export function dedupePath(path: readonly LatLng[]): LatLng[] {
  const out: LatLng[] = [];
  for (const p of path) {
    const last = out[out.length - 1];
    if (!last || last.lat !== p.lat || last.lng !== p.lng) {
      out.push(p);
    }
  }
  return out;
}
