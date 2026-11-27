// Survey stations along the fictional circuit, in horizontal metres (X, Z).
// The tangent and curvature come from the same spline as the road mesh.
const knots: ReadonlyArray<readonly [number, number]> = [
  [-48, 80],
  [-55, 23],
  [-46, -35],
  [-17, -77],
  [14, -109],
  [62, -127],
  [92, -104],
  [99, -63],
  [74, -34],
  [43, -11],
  [45, 23],
  [72, 54],
  [81, 92],
  [53, 119],
  [7, 123],
  [-30, 111],
];
const samplesPerSegment = 64;

function coordinate(t: number, axis: 0 | 1) {
  const i = Math.floor(t) % knots.length,
    u = t - Math.floor(t);
  const a = knots[(i + knots.length - 1) % knots.length][axis],
    b = knots[i][axis];
  const c = knots[(i + 1) % knots.length][axis],
    d = knots[(i + 2) % knots.length][axis];
  const p = (c - a) / 2,
    q = a - 2.5 * b + 2 * c - 0.5 * d,
    r = 0.5 * (d - a) + 1.5 * (b - c);
  return {
    position: b + u * (p + u * (q + u * r)),
    first: p + u * (2 * q + 3 * u * r),
    second: 2 * q + 6 * u * r,
  };
}

const count = knots.length * samplesPerSegment;
const stations = new Float64Array(count + 1);
let lastX = knots[0][0],
  lastZ = knots[0][1];
for (let i = 1; i <= count; i++) {
  const x = coordinate(i / samplesPerSegment, 0).position,
    z = coordinate(i / samplesPerSegment, 1).position;
  stations[i] = stations[i - 1] + Math.hypot(x - lastX, z - lastZ);
  lastX = x;
  lastZ = z;
}
export const raceLapLength = stations[count];

/** Heading increases clockwise from −Z. Positive curvature turns to the driver's right. */
export function raceCourse(distance: number, laneMetres = 0) {
  const s = ((distance % raceLapLength) + raceLapLength) % raceLapLength;
  let low = 0,
    high = count;
  while (low + 1 < high) {
    const mid = (low + high) >>> 1;
    if (stations[mid] <= s) low = mid;
    else high = mid;
  }
  const t = (low + (s - stations[low]) / (stations[high] - stations[low])) / samplesPerSegment;
  const x = coordinate(t, 0),
    z = coordinate(t, 1);
  const length = Math.hypot(x.first, z.first);
  const rightX = -z.first / length,
    rightZ = x.first / length;
  const curvature = (x.first * z.second - z.first * x.second) / length ** 3;
  return {
    x: x.position + laneMetres * rightX,
    z: z.position + laneMetres * rightZ,
    heading: Math.atan2(x.first, -z.first),
    curvature: curvature / (1 - laneMetres * curvature),
  };
}
