import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSrt, formatSrtTimestamp } from '../../lib/srt.js';

describe('Bot unit_srt', () => {

  test('formatSrtTimestamp formats seconds as HH:MM:SS,mmm', () => {
    assert.equal(formatSrtTimestamp(0), '00:00:00,000');
    assert.equal(formatSrtTimestamp(2.1), '00:00:02,100');
    assert.equal(formatSrtTimestamp(65.5), '00:01:05,500');
    assert.equal(formatSrtTimestamp(3661.25), '01:01:01,250');
  });

  test('formatSrtTimestamp clamps negative/invalid input to zero', () => {
    assert.equal(formatSrtTimestamp(-5), '00:00:00,000');
    assert.equal(formatSrtTimestamp(NaN), '00:00:00,000');
    assert.equal(formatSrtTimestamp(undefined), '00:00:00,000');
  });

  test('buildSrt returns empty string for no segments', () => {
    assert.equal(buildSrt([]), '');
    assert.equal(buildSrt(null), '');
    assert.equal(buildSrt(undefined), '');
  });

  test('buildSrt builds sequentially numbered cues with correct timecodes', () => {
    const segments = [
      { id: 0, start: 0.0, end: 2.1, text: 'Hello world.' },
      { id: 1, start: 2.1, end: 4.253, text: 'This is a test.' }
    ];
    const srt = buildSrt(segments);
    assert.equal(
      srt,
      '1\n00:00:00,000 --> 00:00:02,100\nHello world.\n\n' +
      '2\n00:00:02,100 --> 00:00:04,253\nThis is a test.\n'
    );
  });

  test('buildSrt trims segment text and skips empty segments', () => {
    const segments = [
      { start: 0, end: 1, text: '  Padded text.  ' },
      { start: 1, end: 2, text: '   ' },
      { start: 2, end: 3, text: 'Final line.' }
    ];
    const srt = buildSrt(segments);
    // The empty segment must be skipped and numbering must stay sequential
    assert.equal(
      srt,
      '1\n00:00:00,000 --> 00:00:01,000\nPadded text.\n\n' +
      '2\n00:00:02,000 --> 00:00:03,000\nFinal line.\n'
    );
  });
});
