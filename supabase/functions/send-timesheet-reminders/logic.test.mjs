import assert from 'node:assert/strict';
import test from 'node:test';
import { eligibleStart, mexicoNow, monday, reminderPeriods, weekdays } from './logic.ts';

test('Wednesday 10:00 in Mexico City uses the correct local hour', () => {
  assert.deepEqual(mexicoNow(new Date('2026-10-21T15:59:00Z')), { date: '2026-10-21', weekday: 'Wed', hour: 9, minute: 59 });
  assert.deepEqual(mexicoNow(new Date('2026-10-21T16:00:00Z')), { date: '2026-10-21', weekday: 'Wed', hour: 10, minute: 0 });
});

test('Wednesday reminder reviews last week and only completed days this week', () => {
  assert.deepEqual(reminderPeriods('2026-10-21'), {
    previousStart: '2026-10-12', previousEnd: '2026-10-16',
    currentStart: '2026-10-19', currentEnd: '2026-10-20',
  });
  assert.deepEqual(reminderPeriods('2027-01-06'), {
    previousStart: '2026-12-28', previousEnd: '2027-01-01',
    currentStart: '2027-01-04', currentEnd: '2027-01-05',
  });
});

test('weekdays include Friday and group across a year boundary', () => {
  assert.deepEqual(weekdays('2026-10-08', '2026-10-11'), ['2026-10-08', '2026-10-09']);
  assert.equal(monday('2027-01-01'), '2026-12-28');
});

test('the latest entry date prevents reminders before hiring', () => {
  assert.equal(eligibleStart('2026-07-01', '2026-09-14', '2026-07-09'), '2026-09-14');
  assert.equal(eligibleStart(null, null, '2026-07-09'), '2026-07-09');
});
