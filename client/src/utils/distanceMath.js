/**
 * Calculate Euclidean distance between two points.
 * Each point must have x and y coordinates.
 */
export function calculateDistance(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;

    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculate audio volume based on distance.
 * Volume decreases linearly from 1 to 0.
 *
 * distance = 0   -> volume = 1
 * distance = 50  -> volume = 0.5
 * distance = 100 -> volume = 0
 */
export function calculateVolume(distance, maxDistance = 100) {
    if (
        !Number.isFinite(distance) ||
        !Number.isFinite(maxDistance) ||
        distance < 0 ||
        maxDistance <= 0
    ) {
        return 0;
    }

    return Math.max(0, Math.min(1, 1 - distance / maxDistance));
}

/**
 * Determine the orientation of three points.
 * Returns 0 if collinear, 1 if clockwise, 2 if counterclockwise.
 */
function orientation(a, b, c) {
    const value =
        (b.x - a.x) * (c.y - a.y) -
        (b.y - a.y) * (c.x - a.x);

    if (Math.abs(value) < 1e-9) {
        return 0;
    }

    return value > 0 ? 2 : 1;
}

/**
 * Check whether point b lies on segment a-c.
 */
function onSegment(a, b, c) {
    const epsilon = 1e-9;

    return (
        b.x <= Math.max(a.x, c.x) + epsilon &&
        b.x >= Math.min(a.x, c.x) - epsilon &&
        b.y <= Math.max(a.y, c.y) + epsilon &&
        b.y >= Math.min(a.y, c.y) - epsilon
    );
}

/**
 * Check whether two line segments intersect.
 *
 * Segment 1: p1 -> q1
 * Segment 2: p2 -> q2
 */
export function segmentsIntersect(p1, q1, p2, q2) {
    const o1 = orientation(p1, q1, p2);
    const o2 = orientation(p1, q1, q2);
    const o3 = orientation(p2, q2, p1);
    const o4 = orientation(p2, q2, q1);

    // General intersection case
    if (o1 !== o2 && o3 !== o4) {
        return true;
    }

    // Special cases: collinear segments
    if (o1 === 0 && onSegment(p1, p2, q1)) return true;
    if (o2 === 0 && onSegment(p1, q2, q1)) return true;
    if (o3 === 0 && onSegment(p2, p1, q2)) return true;
    if (o4 === 0 && onSegment(p2, q1, q2)) return true;

    return false;
}

/**
 * Determine whether an obstacle blocks the sound
 * between the listener and speaker.
 *
 * Each obstacle must have:
 * {
 *   start: { x, y },
 *   end: { x, y }
 * }
 */
export function isSoundBlocked(listener, speaker, obstacles = []) {
    return obstacles.some((obstacle) => {
        if (!obstacle?.start || !obstacle?.end) {
            return false;
        }

        return segmentsIntersect(
            listener,
            speaker,
            obstacle.start,
            obstacle.end
        );
    });
}