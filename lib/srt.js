// lib/srt.js
// Build SRT (SubRip Subtitle) file content from Whisper API timestamped segments

/**
 * Format a duration in seconds as an SRT timestamp: HH:MM:SS,mmm
 */
export function formatSrtTimestamp(totalSeconds) {
  const safeSeconds = Number.isFinite(totalSeconds) && totalSeconds > 0 ? totalSeconds : 0;
  const totalMs = Math.round(safeSeconds * 1000);
  const ms = totalMs % 1000;
  const totalSec = Math.floor(totalMs / 1000);
  const s = totalSec % 60;
  const totalMin = Math.floor(totalSec / 60);
  const m = totalMin % 60;
  const h = Math.floor(totalMin / 60);
  const pad = (n, len = 2) => String(n).padStart(len, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

/**
 * Build a complete SRT file body from an array of Whisper segments
 * (each with numeric `start`/`end` in seconds and a `text` string).
 * Returns an empty string if no usable segments are provided.
 */
export function buildSrt(segments) {
  if (!Array.isArray(segments) || segments.length === 0) return '';

  const cues = [];
  let index = 1;
  for (const segment of segments) {
    const text = (segment && segment.text ? String(segment.text) : '').trim();
    if (!text) continue;

    const start = formatSrtTimestamp(segment.start);
    const end = formatSrtTimestamp(segment.end);
    cues.push(`${index}\n${start} --> ${end}\n${text}`);
    index++;
  }

  if (cues.length === 0) return '';
  return cues.join('\n\n') + '\n';
}
