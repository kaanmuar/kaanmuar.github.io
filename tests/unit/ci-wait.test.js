const { describe, test } = require('node:test');
const assert = require('node:assert');
const { classifyRun } = require('../../scripts/ci-wait-lib.cjs');

describe('ci-wait run status (#1725)', () => {
  test('queued-like runs are polled, not watched', () => {
    for (const status of ['queued', 'waiting', 'pending', 'requested']) {
      assert.equal(classifyRun(status), 'not_started');
    }
  });

  test('only in_progress runs use gh run watch', () => {
    assert.equal(classifyRun('in_progress'), 'active');
  });

  test('completed runs stop the wait loop', () => {
    assert.equal(classifyRun('completed'), 'complete');
  });

  test('unexpected statuses fall back to polling', () => {
    assert.equal(classifyRun(''), 'unknown');
    assert.equal(classifyRun('startup_failure'), 'unknown');
  });
});