import assert from 'node:assert/strict';
import test from 'node:test';
import { renderReminderEmail } from './email.ts';

test('email names only the pending weeks and omits day details', () => {
  const email = renderReminderEmail('Ana López', 'https://rh.example.com', { current: true, previous: false });
  assert.match(email.html, /Esta semana/);
  assert.doesNotMatch(email.html, /La semana anterior|\d{4}-\d{2}-\d{2}|días pendientes/);
  assert.match(email.html, /background:#11233a/);
  assert.match(email.html, /bgcolor="#0b5eb7"/);
  assert.match(email.text, /https:\/\/rh\.example\.com\/timesheets/);
});

test('email includes both week labels and escapes the collaborator name', () => {
  const email = renderReminderEmail('<Alex & Co>', 'https://rh.example.com', { current: true, previous: true });
  assert.match(email.html, /La semana anterior/);
  assert.match(email.html, /Esta semana/);
  assert.match(email.html, /&lt;Alex/);
  assert.doesNotMatch(email.html, /<Alex/);
});
