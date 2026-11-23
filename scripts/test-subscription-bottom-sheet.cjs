const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

console.log('====================================================');
console.log('TESTING SUBSCRIPTION BOTTOM SHEET & RETIREMENT');
console.log('====================================================\n');

// 1. Check SubscriptionBottomSheet.tsx
console.log('1. Checking SubscriptionBottomSheet.tsx component');
const sheetPath = path.join(__dirname, '..', 'components', 'SubscriptionBottomSheet.tsx');
assert(fs.existsSync(sheetPath), 'SubscriptionBottomSheet.tsx exists');
const sheetContent = fs.readFileSync(sheetPath, 'utf8');

assert(sheetContent.includes('export function SubscriptionBottomSheet'), 'Exports SubscriptionBottomSheet');
assert(sheetContent.includes('PanResponder.create'), 'Implements PanResponder for drag-down gestures');
assert(sheetContent.includes('handleBar'), 'Includes top drag handle bar');
assert(sheetContent.includes('accessibilityLabel="Close"') || sheetContent.includes('closeBtn'), 'Includes explicit close button');
assert(sheetContent.includes('BackHandler.addEventListener'), 'Handles Android hardware back button');
assert(sheetContent.includes('fetchLiveSubscriptionPlans'), 'Fetches live subscription plans');
assert(sheetContent.includes('step === \'plan\''), 'Renders Step 1 (Plan Selection)');
assert(sheetContent.includes('step === \'payment\'') || sheetContent.includes('setStep(\'payment\')'), 'Supports Step 2 (Payment & Checkout)');
assert(sheetContent.includes('PAYMENT_METHODS'), 'Presents payment methods (MoMo, Airtel, Card)');
assert(sheetContent.includes('initiateMomoPayment') && sheetContent.includes('initiateAirtelPayment') && sheetContent.includes('initiateCardPayment'), 'Integrates payment API endpoints');
assert(sheetContent.includes('confirmModalVisible') && sheetContent.includes('confirmDialog'), 'Includes payment confirmation modal');
assert(sheetContent.includes('statusModal') && sheetContent.includes('statusDialog'), 'Includes payment status tracking modal');
assert(sheetContent.includes('WebView') && sheetContent.includes('checkoutVisible'), 'Supports 3DS card checkout WebView modal');
assert(sheetContent.includes('radii.sheet'), 'Uses radii.sheet token for consistent design system border radius');
assert(sheetContent.includes('cardActionBtn') && sheetContent.includes('planActionLabel'), 'Each subscription card includes a direct payment action button');

// 2. Check SubscriptionSheetContext.tsx
console.log('\n2. Checking SubscriptionSheetContext.tsx context');
const contextPath = path.join(__dirname, '..', 'context', 'SubscriptionSheetContext.tsx');
assert(fs.existsSync(contextPath), 'SubscriptionSheetContext.tsx exists');
const contextContent = fs.readFileSync(contextPath, 'utf8');
assert(contextContent.includes('export function SubscriptionSheetProvider'), 'Exports SubscriptionSheetProvider');
assert(contextContent.includes('export function useSubscriptionSheet'), 'Exports useSubscriptionSheet');
assert(contextContent.includes('openSubscriptionSheet'), 'Provides openSubscriptionSheet method');
assert(contextContent.includes('closeSubscriptionSheet'), 'Provides closeSubscriptionSheet method');

// 3. Check App.tsx
console.log('\n3. Checking App.tsx Navigator & Providers');
const appContent = fs.readFileSync(path.join(__dirname, '..', 'App.tsx'), 'utf8');
assert(!appContent.includes('SubscriptionNativeScreen'), 'SubscriptionNativeScreen is removed from App.tsx');
assert(!appContent.includes('<Stack.Screen name="SubscriptionNative"'), 'SubscriptionNative route is removed from Stack.Navigator');
assert(appContent.includes('<SubscriptionSheetProvider>'), 'App root is wrapped with SubscriptionSheetProvider');

// 4. Check navigation/types.ts
console.log('\n4. Checking navigation/types.ts');
const typesContent = fs.readFileSync(path.join(__dirname, '..', 'navigation', 'types.ts'), 'utf8');
assert(!typesContent.includes('SubscriptionNative:'), 'SubscriptionNative is removed from RootStackParamList');

// 5. Check HeaderMenu.tsx
console.log('\n5. Checking HeaderMenu.tsx');
const headerMenuContent = fs.readFileSync(path.join(__dirname, '..', 'components', 'HeaderMenu.tsx'), 'utf8');
assert(headerMenuContent.includes('useSubscriptionSheet'), 'HeaderMenu imports useSubscriptionSheet');
assert(headerMenuContent.includes('openSubscriptionSheet()'), 'Clicking Subscription triggers openSubscriptionSheet()');
assert(!headerMenuContent.includes('route: \'SubscriptionNative\''), 'No route: SubscriptionNative in HeaderMenu');

// 6. Check PaymentNativeScreens.tsx
console.log('\n6. Checking PaymentNativeScreens.tsx');
const paymentScreensContent = fs.readFileSync(path.join(__dirname, '..', 'screens', 'PaymentNativeScreens.tsx'), 'utf8');
assert(!paymentScreensContent.includes('export function SubscriptionNativeScreen'), 'SubscriptionNativeScreen removed from PaymentNativeScreens.tsx');
assert(paymentScreensContent.includes('openSubscriptionSheet'), 'PaymentNativeScreen change pill triggers openSubscriptionSheet');

// 7. Check Entry Points & Gate Modals
console.log('\n7. Checking all other Subscription Entry Points');
const bottomNavContent = fs.readFileSync(path.join(__dirname, '..', 'components', 'BottomNavBar.tsx'), 'utf8');
assert(bottomNavContent.includes('openSubscriptionSheet()'), 'BottomNavBar gate modal triggers openSubscriptionSheet()');
assert(!bottomNavContent.includes('navigate(\'SubscriptionNative\')'), 'BottomNavBar does not navigate to SubscriptionNative');

const profileContent = fs.readFileSync(path.join(__dirname, '..', 'screens', 'ProfileNativeScreen.tsx'), 'utf8');
assert(profileContent.includes('openSubscriptionSheet()'), 'ProfileNativeScreen triggers openSubscriptionSheet()');
assert(!profileContent.includes('navigate(\'SubscriptionNative\')'), 'ProfileNativeScreen does not navigate to SubscriptionNative');

const homeContent = fs.readFileSync(path.join(__dirname, '..', 'screens', 'HomeNativeScreen.tsx'), 'utf8');
assert(homeContent.includes('openSubscriptionSheet()'), 'HomeNativeScreen gate triggers openSubscriptionSheet()');
assert(!homeContent.includes('navigate(\'SubscriptionNative\')'), 'HomeNativeScreen does not navigate to SubscriptionNative');

console.log('\n====================================================');
console.log(`TEST RESULTS: ${passed} / ${passed + failed} PASSED`);
console.log('====================================================');

if (failed > 0) {
  process.exit(1);
}
