import assert from 'node:assert/strict';
import test from 'node:test';
import { eligibleStart, mexicoNow, monday, threeMonthsBefore, weekdays } from './logic.ts';

test('Friday 15:00 in Mexico City uses the correct local date and hour', () => {
  assert.deepEqual(mexicoNow(new Date('2026-10-09T20:59:00Z')), { date: '2026-10-09', weekday: 'Fri', hour: 14 });
  assert.deepEqual(mexicoNow(new Date('2026-10-09T21:00:00Z')), { date: '2026-10-09', weekday: 'Fri', hour: 15 });
});

test('three calendar months clamp at the last day of a short month', () => {
  assert.equal(threeMonthsBefore('2026-05-31'), '2026-02-28');
  assert.equal(threeMonthsBefore('2026-10-09'), '2026-07-09');
});

test('weekdays include Friday and group across a year boundary', () => {
  assert.deepEqual(weekdays('2026-10-08', '2026-10-11'), ['2026-10-08', '2026-10-09']);
  assert.equal(monday('2027-01-01'), '2026-12-28');
});

test('the latest entry date prevents reminders before hiring', () => {
  assert.equal(eligibleStart('2026-07-01', '2026-09-14', '2026-07-09'), '2026-09-14');
  assert.equal(eligibleStart(null, null, '2026-07-09'), '2026-07-09');
});
