import { describe, test, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { handleWebhook } from '../../lib/core.js';
import {
  MOCK_CONFIG,
  MOCK_CTX,
  createReq,
  clearHistory,
  setupFetchMock,
  recordedCalls
} from './helper.mjs';

// Mock Whisper API response including verbose_json segment timestamps,
// as returned by Groq/OpenAI-compatible providers.
const SEGMENTED_TRANSCRIPTION_BODY = {
  text: 'Hello world. This is a test.',
  duration: 4.2,
  segments: [
    { id: 0, start: 0.0, end: 2.1, text: 'Hello world.' },
    { id: 1, start: 2.1, end: 4.2, text: 'This is a test.' }
  ]
};

function withSegmentedTranscriptionMock(fn, extraHandler) {
  return async () => {
    const baseFetch = globalThis.fetch;
    globalThis.fetch = async (url, options = {}) => {
      const urlStr = url.toString();
      if (extraHandler) {
        const extraResult = await extraHandler(urlStr, options);
        if (extraResult !== undefined) return extraResult;
      }
      if (urlStr.includes('/audio/transcriptions')) {
        return {
          ok: true,
          status: 200,
          json: async () => SEGMENTED_TRANSCRIPTION_BODY,
          text: async () => JSON.stringify(SEGMENTED_TRANSCRIPTION_BODY)
        };
      }
      if (urlStr.includes('/sendDocument')) {
        const body = options.body;
        recordedCalls.push({
          url: urlStr,
          method: options.method || 'GET',
          sendDocument: {
            chat_id: body.get('chat_id'),
            caption: body.get('caption'),
            parse_mode: body.get('parse_mode'),
            reply_to_message_id: body.get('reply_to_message_id'),
            documentName: body.get('document')?.name,
            documentText: await body.get('document')?.text()
          }
        });
        return { ok: true, status: 200, json: async () => ({ ok: true, result: { message_id: 999 } }) };
      }
      return baseFetch(url, options);
    };
    try {
      await fn();
    } finally {
      globalThis.fetch = baseFetch;
    }
  };
}

describe('SRT Transcript Scenarios', () => {
  before(() => setupFetchMock());
  afterEach(() => clearHistory());

  test('Private chat voice message is delivered as an .srt document with correct timecodes',
    withSegmentedTranscriptionMock(async () => {
      const update = {
        update_id: 2001,
        message: {
          message_id: 301,
          chat: { id: 12345, type: 'private' },
          from: { id: 12345 },
          voice: { file_id: 'voice_srt_1', file_size: 1000, duration: 5 }
        }
      };
      const req = createReq(update, { owner: '12345' });
      await handleWebhook(req, MOCK_CONFIG, MOCK_CTX);
      await new Promise(resolve => setTimeout(resolve, 50));

      const docCall = recordedCalls.find(c => c.url.includes('/sendDocument'));
      assert.ok(docCall, 'Should have called sendDocument');
      assert.equal(docCall.sendDocument.chat_id, '12345');
      assert.match(docCall.sendDocument.documentName, /\.srt$/, 'Filename should end with .srt');
      assert.match(docCall.sendDocument.caption, /Transcript/i);
      assert.equal(
        docCall.sendDocument.documentText,
        '1\n00:00:00,000 --> 00:00:02,100\nHello world.\n\n' +
        '2\n00:00:02,100 --> 00:00:04,200\nThis is a test.\n'
      );

      // No plain-text transcription message should have been sent instead
      const textMsg = recordedCalls.find(c => c.url.includes('/sendMessage') && /transcription/i.test(c.json?.text || ''));
      assert.ok(!textMsg, 'Should NOT also send a plain-text transcription message');
    })
  );

  test('Guest-mode query falls back to plain text (no document upload possible for guest queries)',
    withSegmentedTranscriptionMock(async () => {
      const update = {
        update_id: 2002,
        guest_message: {
          message_id: 302,
          chat: { id: 54321, type: 'private' },
          from: { id: 77777 },
          voice: { file_id: 'voice_srt_2', file_size: 1000, duration: 5 },
          guest_query_id: 'guest_q_1'
        }
      };
      const req = createReq(update, { owner: '12345', guest: 'on' });
      await handleWebhook(req, MOCK_CONFIG, MOCK_CTX);
      await new Promise(resolve => setTimeout(resolve, 50));

      const docCall = recordedCalls.find(c => c.url.includes('/sendDocument'));
      assert.ok(!docCall, 'Should NOT call sendDocument for guest queries');
      const guestAnswer = recordedCalls.find(c => c.url.includes('/answerGuestQuery'));
      assert.ok(guestAnswer, 'Should fall back to answerGuestQuery with text content');
    }, async (urlStr) => {
      if (urlStr.includes('getMe')) {
        return { ok: true, status: 200, json: async () => ({ ok: true, result: { username: 'testbot', id: 99999, supports_guest_queries: true } }) };
      }
      return undefined;
    })
  );
});
