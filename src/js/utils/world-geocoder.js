/**
 * Offline World Geocoder
 *
 * Nearest-city search using a K-Dimensional Tree built on 3D Cartesian
 * coordinates projected from lat/lng onto the unit sphere.
 *
 * Projection: (lat, lng) → (cos φ cos λ, cos φ sin λ, sin φ)
 * Distance: squared Euclidean on the unit sphere (monotone with great-circle)
 *
 * Build: O(N log N)  |  Search: O(log N)
 */

const TO_RAD = Math.PI / 180;

/**
 * Projects a lat/lng pair onto the unit sphere as a Cartesian triplet.
 * @param {number} lat
 * @param {number} lon
 * @returns {[number, number, number]}
 */
function toCartesian(lat, lon) {
    const φ = lat * TO_RAD;
    const λ = lon * TO_RAD;
    return [
        Math.cos(φ) * Math.cos(λ),
        Math.cos(φ) * Math.sin(λ),
        Math.sin(φ),
    ];
}

/**
 * Squared Euclidean distance between two 3D points.
 * Sufficient for nearest-neighbor comparisons (avoids sqrt).
 * @param {[number,number,number]} a
 * @param {[number,number,number]} b
 * @returns {number}
 */
function sqDist(a, b) {
    const dx = a[0] - b[0];
    const dy = a[1] - b[1];
    const dz = a[2] - b[2];
    return dx * dx + dy * dy + dz * dz;
}

/**
 * Recursively builds a KD-Tree node by median partitioning.
 * @param {Array<object>} points
 * @param {number} depth
 * @returns {object|null}
 */
function buildNode(points, depth) {
    if (points.length === 0) return null;

    const axis = depth % 3;
    points.sort((a, b) => a.xyz[axis] - b.xyz[axis]);

    const mid = Math.floor(points.length / 2);
    return {
        point: points[mid],
        left:  buildNode(points.slice(0, mid), depth + 1),
        right: buildNode(points.slice(mid + 1), depth + 1),
    };
}

/**
 * Recursively searches the tree for the nearest point to target.
 * @param {object|null} node
 * @param {[number,number,number]} target
 * @param {number} depth
 * @param {{ dist: number, point: object|null }} best
 * @returns {{ dist: number, point: object|null }}
 */
function searchNode(node, target, depth, best) {
    if (!node) return best;

    const d = sqDist(node.point.xyz, target);
    if (d < best.dist) {
        best = { dist: d, point: node.point };
    }

    const axis = depth % 3;
    const diff = target[axis] - node.point.xyz[axis];
    const [near, far] = diff <= 0
        ? [node.left, node.right]
        : [node.right, node.left];

    best = searchNode(near, target, depth + 1, best);

    // Prune far branch only if the splitting plane is within current best distance
    if (diff * diff < best.dist) {
        best = searchNode(far, target, depth + 1, best);
    }

    return best;
}

/**
 * Builds a KD-Tree from a raw cities array.
 *
 * Expected input format per entry: [lat, lon, "City Name", "CC"]
 *
 * @param {Array<[number, number, string, string]>} cities
 * @returns {object|null} root node of the KD-Tree, or null if cities is empty
 */
export function buildCityTree(cities) {
    if (!cities || cities.length === 0) return null;

    const points = cities.map(c => ({
        xyz: toCartesian(c[0], c[1]),
        lat: c[0],
        lon: c[1],
        name: c[2],
        countryCode: c[3],
    }));

    return buildNode(points, 0);
}

/**
 * Finds the nearest city to the given GPS coordinates.
 *
 * @param {object|null} tree - Root node from buildCityTree
 * @param {number} lat
 * @param {number} lon
 * @returns {{ name: string, countryCode: string, lat: number, lon: number }|null}
 */
export function findNearestCity(tree, lat, lon) {
    if (!tree) return null;

    const target = toCartesian(lat, lon);
    const result = searchNode(tree, target, 0, { dist: Infinity, point: null });

    if (!result.point) return null;

    return {
        name:        result.point.name,
        countryCode: result.point.countryCode,
        lat:         result.point.lat,
        lon:         result.point.lon,
    };
}
