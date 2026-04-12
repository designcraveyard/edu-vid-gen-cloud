import type { EditedTimeline, VideoClipEdit, VOClipEdit } from '@/lib/types';

function framesToTC(totalFrames: number, fps: number): string {
  const frames = Math.round(totalFrames);
  const ff = frames % fps;
  const totalSeconds = Math.floor(frames / fps);
  const ss = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const mm = totalMinutes % 60;
  const hh = Math.floor(totalMinutes / 60);
  return (
    String(hh).padStart(2, '0') + ':' +
    String(mm).padStart(2, '0') + ':' +
    String(ss).padStart(2, '0') + ':' +
    String(ff).padStart(2, '0')
  );
}

function secondsToTC(seconds: number, fps: number): string {
  return framesToTC(Math.round(seconds * fps), fps);
}

function reelName(file: string): string {
  const base = file.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '');
  // CMX 3600 reel names are up to 8 chars, uppercase
  return base.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8).padEnd(8, ' ');
}

export function generateEDL(timeline: EditedTimeline): string {
  const fps = timeline.framerate || 25;
  const lines: string[] = [];

  lines.push('TITLE: Edited Timeline');
  lines.push('FCM: NON-DROP FRAME');
  lines.push('');

  let eventNum = 1;

  // Combine video and VO clips, sorted by timeline offset
  interface EDLEvent {
    type: 'V' | 'A';
    file: string;
    trimStart: number;
    trimEnd: number;
    sourceDuration: number;
    timelineOffset: number;
    transitionOut: { type: string; duration: number } | null;
  }

  const events: EDLEvent[] = [];

  for (const v of timeline.tracks.video) {
    events.push({
      type: 'V',
      file: v.file,
      trimStart: v.trimStart,
      trimEnd: v.trimEnd,
      sourceDuration: v.sourceDuration,
      timelineOffset: v.timelineOffset,
      transitionOut: v.transitionOut,
    });
  }

  for (const a of timeline.tracks.voiceover) {
    events.push({
      type: 'A',
      file: a.file,
      trimStart: a.trimStart,
      trimEnd: a.trimEnd,
      sourceDuration: a.sourceDuration,
      timelineOffset: a.timelineOffset,
      transitionOut: null,
    });
  }

  events.sort((a, b) => a.timelineOffset - b.timelineOffset);

  for (const evt of events) {
    const num = String(eventNum).padStart(3, '0');
    const reel = reelName(evt.file);
    const track = evt.type === 'V' ? 'V     ' : 'A     ';
    const clipDuration = evt.sourceDuration - evt.trimStart - evt.trimEnd;

    const srcIn = secondsToTC(evt.trimStart, fps);
    const srcOut = secondsToTC(evt.trimStart + clipDuration, fps);
    const recIn = secondsToTC(evt.timelineOffset, fps);
    const recOut = secondsToTC(evt.timelineOffset + clipDuration, fps);

    // If there's a transition, emit a dissolve event
    if (evt.transitionOut && evt.transitionOut.type && evt.transitionOut.duration > 0) {
      const durFrames = Math.round(evt.transitionOut.duration * fps);
      lines.push(`${num}  ${reel} ${track} D ${String(durFrames).padStart(3, '0')}    ${srcIn} ${srcOut} ${recIn} ${recOut}`);
    } else {
      lines.push(`${num}  ${reel} ${track} C        ${srcIn} ${srcOut} ${recIn} ${recOut}`);
    }

    // Source file comment
    lines.push(`* FROM CLIP NAME: ${evt.file}`);
    lines.push('');

    eventNum++;
  }

  return lines.join('\n');
}
