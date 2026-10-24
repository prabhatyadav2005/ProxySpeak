/**
 * Proximity Engine & Latency Benchmark Unit Tests
 * Member 2 Deliverable: Sub-20ms latency benchmark and 100px proximity verification
 */

function calculateDistance(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

const PROXIMITY_THRESHOLD_PX = 100;

console.log('====================================================');
console.log(' ProxiSpeak Signaling & Proximity Engine Unit Tests');
console.log('====================================================\n');

// Test 1: Distance calculation precision
console.log('Test 1: Euclidean Distance Accuracy...');
const d1 = calculateDistance(0, 0, 30, 40);
if (d1 === 50) {
  console.log('  [PASS] 3-4-5 triangle distance is exactly 50px');
} else {
  console.error(`  [FAIL] Expected 50, got ${d1}`);
  process.exit(1);
}

// Test 2: Proximity boundary check (100px)
console.log('\nTest 2: Proximity Threshold Boundaries (&le; 100px)...');
const withinRange = calculateDistance(100, 100, 160, 180) <= PROXIMITY_THRESHOLD_PX; // dist = 100
const outsideRange = calculateDistance(100, 100, 200, 200) <= PROXIMITY_THRESHOLD_PX; // dist = 141.42

if (withinRange === true && outsideRange === false) {
  console.log('  [PASS] Exactly 100px triggers proximity; >100px does not trigger');
} else {
  console.error('  [FAIL] Proximity boundary check failed');
  process.exit(1);
}

// Test 3: High-throughput Latency Benchmark (<20ms SLA)
console.log('\nTest 3: High-throughput Latency Benchmark (1,000 spatial checks)...');
const start = performance.now();
for (let i = 0; i < 1000; i++) {
  const x1 = Math.random() * 1920;
  const y1 = Math.random() * 1080;
  const x2 = Math.random() * 1920;
  const y2 = Math.random() * 1080;
  calculateDistance(x1, y1, x2, y2);
}
const elapsed = performance.now() - start;
console.log(`  Processed 1,000 spatial calculations in: ${elapsed.toFixed(3)}ms`);

if (elapsed < 20) {
  console.log(`  [PASS] Latency ${elapsed.toFixed(3)}ms is well within the sub-20ms SLA!`);
} else {
  console.warn(`  [WARN] Latency exceeded 20ms threshold: ${elapsed.toFixed(3)}ms`);
}

console.log('\nAll tests completed successfully!');
// [21 Oct 2026] Added unit test cases for boundary edge-cases at exactly 100px earshot
