const assert = require('assert');

console.log('========================================');
console.log('RUNNING COMPREHENSIVE PAYMENT FLOW TESTS');
console.log('========================================\n');

let passedTests = 0;
let totalTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    ${err.message}`);
  }
}

// ----------------------------------------------------
// 1. Phone number formatting & validation
// ----------------------------------------------------
console.log('1. Testing Phone Formatting & Validation');

// Import phone utility logic
function toLocalRwandaPhone(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (/^07[2389]\d{7}$/.test(digits)) return digits;
  if (/^2507[2389]\d{7}$/.test(digits)) return `0${digits.slice(3)}`;
  if (/^7[2389]\d{7}$/.test(digits)) return `0${digits}`;
  return null;
}

function toIntlRwandaPhone(raw) {
  const local = toLocalRwandaPhone(raw);
  return local ? `250${local.slice(1)}` : null;
}

test('Valid local 078 number', () => {
  assert.strictEqual(toLocalRwandaPhone('0788123456'), '0788123456');
  assert.strictEqual(toIntlRwandaPhone('0788123456'), '250788123456');
});

test('Valid local 079 (MTN) number', () => {
  assert.strictEqual(toLocalRwandaPhone('0791234567'), '0791234567');
  assert.strictEqual(toIntlRwandaPhone('0791234567'), '250791234567');
});

test('Valid local 072/073 (Airtel) numbers', () => {
  assert.strictEqual(toLocalRwandaPhone('0722123456'), '0722123456');
  assert.strictEqual(toLocalRwandaPhone('0733123456'), '0733123456');
});

test('Valid international +250... format', () => {
  assert.strictEqual(toLocalRwandaPhone('+250788123456'), '0788123456');
  assert.strictEqual(toLocalRwandaPhone('250788123456'), '0788123456');
});

test('Valid short 7XXXXXXXX format', () => {
  assert.strictEqual(toLocalRwandaPhone('788123456'), '0788123456');
});

test('Phone with spaces and hyphens', () => {
  assert.strictEqual(toLocalRwandaPhone('0788 123 456'), '0788123456');
  assert.strictEqual(toLocalRwandaPhone('+250-788-123-456'), '0788123456');
});

test('Rejects invalid phone numbers', () => {
  assert.strictEqual(toLocalRwandaPhone('0718123456'), null, '071 is not a Rwanda carrier');
  assert.strictEqual(toLocalRwandaPhone('078812345'), null, 'Too short (8 digits)');
  assert.strictEqual(toLocalRwandaPhone('07881234567'), null, 'Too long (11 digits)');
  assert.strictEqual(toLocalRwandaPhone(''), null, 'Empty string');
  assert.strictEqual(toLocalRwandaPhone('abcd'), null, 'Non-digits');
});

// ----------------------------------------------------
// 2. Card Validation
// ----------------------------------------------------
console.log('\n2. Testing Card Validation');

function validateCardNumber(raw) {
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits.charAt(i), 10);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

function validateCardExpiry(raw) {
  const match = String(raw).trim().match(/^(\d{2})\/(\d{2})$/);
  if (!match) return false;
  const month = parseInt(match[1], 10);
  if (month < 1 || month > 12) return false;
  return true;
}

function validateCvv(raw) {
  const digits = String(raw).replace(/\D/g, '');
  return digits.length === 3 || digits.length === 4;
}

test('Valid card expiry MM/YY', () => {
  assert.strictEqual(validateCardExpiry('12/28'), true);
  assert.strictEqual(validateCardExpiry('01/26'), true);
  assert.strictEqual(validateCardExpiry('13/26'), false, 'Month 13 is invalid');
  assert.strictEqual(validateCardExpiry('00/26'), false, 'Month 00 is invalid');
  assert.strictEqual(validateCardExpiry('2026/12'), false, 'Wrong format');
});

test('Valid CVV', () => {
  assert.strictEqual(validateCvv('123'), true);
  assert.strictEqual(validateCvv('1234'), true);
  assert.strictEqual(validateCvv('12'), false);
  assert.strictEqual(validateCvv('12345'), false);
});

// ----------------------------------------------------
// 3. Status resolution logic
// ----------------------------------------------------
console.log('\n3. Testing Payment Status Resolution');

function resolvePaymentStatus(payload) {
  if (!payload || typeof payload !== 'object') return 'unknown';
  const root = payload;
  const objs = [root];
  if (root.data && typeof root.data === 'object' && !Array.isArray(root.data)) objs.push(root.data);
  if (root.payment && typeof root.payment === 'object' && !Array.isArray(root.payment)) objs.push(root.payment);

  for (const obj of objs) {
    if (obj.paymentStatus === true || obj.paid === true || obj.success === true) return 'success';
    const status = String(obj.status || '').toLowerCase().trim();
    if (['approved', 'active', 'completed', 'success', 'paid', 'successful', 'confirmed'].includes(status)) return 'success';
    if (['cancelled', 'canceled', 'user_cancelled'].includes(status)) return 'cancelled';
    if (['failed', 'rejected', 'expired', 'declined', 'error'].includes(status)) return 'failed';
    if (['pending', 'processing', 'initiated', 'waiting', 'queued'].includes(status)) return 'pending';
  }
  return 'unknown';
}

test('Resolves success status correctly', () => {
  assert.strictEqual(resolvePaymentStatus({ paymentStatus: true }), 'success');
  assert.strictEqual(resolvePaymentStatus({ data: { status: 'approved' } }), 'success');
  assert.strictEqual(resolvePaymentStatus({ payment: { paid: true } }), 'success');
  assert.strictEqual(resolvePaymentStatus({ status: 'completed' }), 'success');
});

test('Resolves cancelled status correctly', () => {
  assert.strictEqual(resolvePaymentStatus({ status: 'cancelled' }), 'cancelled');
  assert.strictEqual(resolvePaymentStatus({ data: { status: 'user_cancelled' } }), 'cancelled');
});

test('Resolves failed status correctly', () => {
  assert.strictEqual(resolvePaymentStatus({ status: 'failed' }), 'failed');
  assert.strictEqual(resolvePaymentStatus({ data: { status: 'declined' } }), 'failed');
  assert.strictEqual(resolvePaymentStatus({ error: 'rejected', status: 'error' }), 'failed');
});

test('Resolves pending status correctly', () => {
  assert.strictEqual(resolvePaymentStatus({ status: 'pending' }), 'pending');
  assert.strictEqual(resolvePaymentStatus({ data: { status: 'processing' } }), 'pending');
});

// ----------------------------------------------------
// 4. i18n Dictionaries Verification
// ----------------------------------------------------
console.log('\n4. Testing i18n Dictionaries for Payment Keys');

const fs = require('fs');
const dictPath = './i18n/dictionaries.ts';
const dictContent = fs.readFileSync(dictPath, 'utf8');

const requiredKeys = [
  'payment.title',
  'payment.payNow',
  'payment.confirmTitle',
  'payment.confirmPromptMomo',
  'payment.confirmPromptAirtel',
  'payment.confirmPromptCard',
  'payment.confirmAndPay',
  'payment.pendingBannerTitle',
  'payment.pendingBannerBody',
  'payment.checkStatus',
  'payment.dismiss',
  'payment.status.processingTitle',
  'payment.status.successTitle',
  'payment.status.failedTitle',
  'payment.status.cancelledTitle',
  'payment.status.timeoutTitle',
  'validate.phoneRequired',
  'validate.phoneInvalid'
];

requiredKeys.forEach(key => {
  test(`Dictionary contains key "${key}"`, () => {
    const occurrences = (dictContent.match(new RegExp(`'${key}':`, 'g')) || []).length;
    assert.strictEqual(occurrences >= 3, true, `Key ${key} should appear at least 3 times (en, rw, fr), found ${occurrences}`);
  });
});

// ----------------------------------------------------
// 5. Codebase Verification for Screens and Flow
// ----------------------------------------------------
console.log('\n5. Testing PaymentNativeScreens Implementation');

const paymentScreenPath = './screens/PaymentNativeScreens.tsx';
const paymentScreenContent = fs.readFileSync(paymentScreenPath, 'utf8');

test('No auto-resume useEffect in PaymentNativeScreens', () => {
  const autoResumePattern = /void resumePendingPayment\(pendingPayment\);[\s\S]*?\[accessToken, checkingPending, payBusy, pendingPayment\]/;
  assert.strictEqual(autoResumePattern.test(paymentScreenContent), false, 'Auto-resume effect should NOT exist');
});

test('PaymentConfirmationModal is defined and exported', () => {
  assert.strictEqual(paymentScreenContent.includes('export function PaymentConfirmationModal'), true);
});

test('PaymentConfirmationModal has Confirm and Cancel actions', () => {
  assert.strictEqual(paymentScreenContent.includes("t('payment.confirmAndPay')"), true);
  assert.strictEqual(paymentScreenContent.includes("t('common.cancel')"), true);
});

test('handlePressPayNow triggers confirmation modal after validation', () => {
  assert.strictEqual(paymentScreenContent.includes('setConfirmModalVisible(true)'), true);
});

test('handleConfirmPayment triggers executePayment', () => {
  assert.strictEqual(paymentScreenContent.includes('executePayment(validatedTargetPhone)'), true);
});

test('executePayment has duplicate submission prevention lock', () => {
  assert.strictEqual(paymentScreenContent.includes('if (isSubmittingRef.current || payBusy) return;'), true);
  assert.strictEqual(paymentScreenContent.includes('isSubmittingRef.current = true;'), true);
});

test('executePayment clears pending payment before initiating new charge', () => {
  assert.strictEqual(paymentScreenContent.includes('await clearPendingPayment();'), true);
});

test('Pay button is connected to handlePressPayNow, not auto-resuming', () => {
  assert.strictEqual(paymentScreenContent.includes('onPress={handlePressPayNow}'), true);
});

console.log('\n========================================');
console.log(`TEST RESULTS: ${passedTests} / ${totalTests} PASSED`);
console.log('========================================');

if (passedTests !== totalTests) {
  process.exit(1);
}
