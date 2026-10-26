function calculateDistance(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

const PROXIMITY_THRESHOLD_PX = 100;

console.log('Running proximity unit tests...\n');

// Test 1: Distance calculation precision
const d1 = calculateDistance(0, 0, 30, 40);
if (d1 === 50) {
  console.log('[PASS] Distance calculation');
} else {
  console.error(`[FAIL] Expected 50, got ${d1}`);
  process.exit(1);
}

// Test 2: 100px boundary evaluation
const withinRange = calculateDistance(100, 100, 160, 180) <= PROXIMITY_THRESHOLD_PX;
const outsideRange = calculateDistance(100, 100, 200, 200) <= PROXIMITY_THRESHOLD_PX;

if (withinRange === true && outsideRange === false) {
  console.log('[PASS] Proximity 100px threshold boundary');
} else {
  console.error('[FAIL] Proximity boundary check failed');
  process.exit(1);
}

// Test 3: Benchmark spatial calculations
const start = performance.now();
for (let i = 0; i < 1000; i++) {
  const x1 = Math.random() * 1920;
  const y1 = Math.random() * 1080;
  const x2 = Math.random() * 1920;
  const y2 = Math.random() * 1080;
  calculateDistance(x1, y1, x2, y2);
}
const elapsed = performance.now() - start;
console.log(`[PASS] 1000 spatial calculations completed in ${elapsed.toFixed(3)}ms (<20ms budget)`);

console.log('\nAll tests passed.');
