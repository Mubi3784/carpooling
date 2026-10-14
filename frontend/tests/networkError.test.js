import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isNetworkError, isAuthError } from '../src/utils/networkError.js';

test('error without a response is a network error', () => {
  assert.equal(isNetworkError({ message: 'Network Error' }), true);
});

test('ERR_NETWORK code is a network error', () => {
  assert.equal(isNetworkError({ code: 'ERR_NETWORK', response: undefined }), true);
});

test('server 500 response is not a network error', () => {
  assert.equal(isNetworkError({ response: { status: 500 } }), false);
});

test('401 is an auth error, not a network error', () => {
  const err = { response: { status: 401 } };
  assert.equal(isAuthError(err), true);
  assert.equal(isNetworkError(err), false);
});

test('403 is an auth error; 500 is not', () => {
  assert.equal(isAuthError({ response: { status: 403 } }), true);
  assert.equal(isAuthError({ response: { status: 500 } }), false);
  assert.equal(isAuthError({ message: 'Network Error' }), false);
});

test('canceled requests are not network errors', () => {
  assert.equal(isNetworkError({ code: 'ERR_CANCELED' }), false);
  assert.equal(isNetworkError({ name: 'CanceledError' }), false);
});

test('null/undefined are not errors of either kind', () => {
  assert.equal(isNetworkError(null), false);
  assert.equal(isNetworkError(undefined), false);
  assert.equal(isAuthError(null), false);
  assert.equal(isAuthError(undefined), false);
});
