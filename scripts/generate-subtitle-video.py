#!/usr/bin/env python3
"""
generate-subtitle-video.py

Creates a karaoke-style subtitle video from ElevenLabs character timestamps.
Each word lights up (yellow) as it is spoken; other words are dimmed.
Rendered entirely with PIL — no libass required.

Modes:
  1. Black background (default):
     python3 generate-subtitle-video.py --timestamps t.json --audio vo.mp3 --output out.mp4

  2. Overlay on existing video (for sync verification):
     python3 generate-subtitle-video.py --timestamps t.json --audio vo.mp3 \
         --video clip.mp4 --clip-start 79.98 --clip-end 87.49 --output verify.mp4
"""

import argparse, json, subprocess, sys, os
from PIL import Image, ImageDraw, ImageFont

# ── CLI ───────────────────────────────────────────────────────────────────────
p = argparse.ArgumentParser()
p.add_argument('--timestamps',     required=True)
p.add_argument('--audio',          required=True)
p.add_argument('--output',         default='subtitles-video.mp4')
p.add_argument('--words-per-line', type=int, default=5)
p.add_argument('--fps',            type=int, default=30)
p.add_argument('--width',          type=int, default=1920)
p.add_argument('--height',         type=int, default=1080)
p.add_argument('--style',          default='pill', choices=['pill', 'karaoke'],
               help="pill: YouTube-style single-line rounded pill (default). "
                    "karaoke: word-by-word highlight with translucent band.")
# Overlay mode
p.add_argument('--video',          default=None, help='Overlay subtitles on this video instead of black bg')
p.add_argument('--clip-start',     type=float, default=None, help='VO start time (seconds) in full-vo for this clip')
p.add_argument('--clip-end',       type=float, default=None, help='VO end time (seconds) in full-vo for this clip')
args = p.parse_args()

OVERLAY_MODE = args.video is not None
W, H, FPS = args.width, args.height, args.fps
WORDS_PER_LINE = args.words_per_line

# ── Load timestamps → word list ───────────────────────────────────────────────
print("Loading timestamps...")
with open(args.timestamps) as f:
    data = json.load(f)

chars  = data['characters']
starts = data['character_start_times_seconds']
ends   = data['character_end_times_seconds']

words = []
buf, ws, we = [], None, None
for i, ch in enumerate(chars):
    if ch in (' ', '\n', '\r'):
        if buf:
            words.append({'text': ''.join(buf), 'start': ws, 'end': we})
            buf, ws, we = [], None, None
    else:
        if ws is None: ws = starts[i]
        we = ends[i]
        buf.append(ch)
if buf:
    words.append({'text': ''.join(buf), 'start': ws, 'end': we})

print(f"  {len(words)} words parsed")

# ── In overlay mode, filter words to clip window and rebase timestamps ────────
if OVERLAY_MODE and args.clip_start is not None:
    clip_s, clip_e = args.clip_start, args.clip_end or words[-1]['end']
    words = [w for w in words if w['end'] >= clip_s and w['start'] <= clip_e]
    # Rebase to clip-relative time (0 = clip start)
    for w in words:
        w['start'] = max(0, w['start'] - clip_s)
        w['end']   = w['end'] - clip_s
    print(f"  Filtered to clip window: {clip_s:.2f}-{clip_e:.2f} → {len(words)} words")

# ── Group into lines ──────────────────────────────────────────────────────────
lines = []
for i in range(0, len(words), WORDS_PER_LINE):
    chunk = words[i:i + WORDS_PER_LINE]
    lines.append({'words': chunk, 'start': chunk[0]['start'], 'end': chunk[-1]['end'] + 0.4})

print(f"  {len(lines)} subtitle lines")

# ── Duration & audio source ───────────────────────────────────────────────────
import tempfile, atexit

if OVERLAY_MODE:
    # Duration comes from the video file, not the full audio
    dur_raw = subprocess.check_output(
        ['ffprobe', '-v', 'quiet', '-show_entries', 'format=duration',
         '-of', 'csv=p=0', args.video]
    ).decode().strip()
    DURATION = float(dur_raw)

    # In overlay mode: extract clip-window audio from full VO and use it
    _tmp_wav = tempfile.mktemp(suffix='.wav')
    atexit.register(lambda: os.path.exists(_tmp_wav) and os.remove(_tmp_wav))
    clip_s = args.clip_start or 0
    subprocess.check_call(
        ['ffmpeg', '-y', '-i', args.audio,
         '-ss', str(clip_s), '-t', str(DURATION),
         '-c:a', 'pcm_s16le', _tmp_wav],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
    )
    AUDIO_INPUT = _tmp_wav

    # Get video dimensions
    dims = subprocess.check_output(
        ['ffprobe', '-v', 'quiet', '-select_streams', 'v:0',
         '-show_entries', 'stream=width,height',
         '-of', 'csv=p=0', args.video]
    ).decode().strip().split(',')
    W, H = int(dims[0]), int(dims[1])

    # Get video FPS
    fps_raw = subprocess.check_output(
        ['ffprobe', '-v', 'quiet', '-select_streams', 'v:0',
         '-show_entries', 'stream=r_frame_rate',
         '-of', 'csv=p=0', args.video]
    ).decode().strip()
    num, den = fps_raw.split('/')
    FPS = round(int(num) / int(den))

    print(f"  Overlay mode: {W}x{H} @ {FPS}fps, {DURATION:.1f}s")
else:
    dur_raw = subprocess.check_output(
        ['ffprobe', '-v', 'quiet', '-show_entries', 'format=duration',
         '-of', 'csv=p=0', args.audio]
    ).decode().strip()
    DURATION = float(dur_raw)

    _tmp_wav = tempfile.mktemp(suffix='.wav')
    atexit.register(lambda: os.path.exists(_tmp_wav) and os.remove(_tmp_wav))
    print(f"  Normalising audio → {_tmp_wav}")
    subprocess.check_call(
        ['ffmpeg', '-y', '-i', args.audio, '-c:a', 'pcm_s16le', _tmp_wav],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
    )
    AUDIO_INPUT = _tmp_wav

TOTAL_FRAMES = int(DURATION * FPS) + 1
print(f"  {DURATION:.1f}s → {TOTAL_FRAMES} frames @ {FPS}fps")

# ── Font setup ────────────────────────────────────────────────────────────────
# Scale typography to the actual frame size so both 16:9 (e.g. 1248x704,
# 1920x1080) and 9:16 (e.g. 720x1280, 1080x1920) render proportionally.
# Reference: 72 px on a 1080-tall frame = ~6.7% of frame height.
FONT_SCALE   = 0.058           # font size as fraction of frame height
SIDE_MARGIN  = 0.04            # safe horizontal inset on each side
BOTTOM_FRAC  = 0.10            # baseline distance from bottom as fraction of H
LINE_GAP_FRAC = 0.018          # vertical gap between wrapped lines

FONT_SIZE    = max(28, int(H * FONT_SCALE))
LINE_SPACING = max(10, int(H * LINE_GAP_FRAC))
BOTTOM_PAD   = max(40, int(H * BOTTOM_FRAC))
SAFE_W       = int(W * (1 - 2 * SIDE_MARGIN))

def load_font(size):
    candidates = [
        '/System/Library/Fonts/Helvetica.ttc',
        '/System/Library/Fonts/Arial.ttf',
        '/Library/Fonts/Arial.ttf',
        '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
        '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
        '/usr/share/fonts/truetype/freefont/FreeSans.ttf',
    ]
    for path in candidates:
        if os.path.exists(path):
            try: return ImageFont.truetype(path, size)
            except: pass
    return ImageFont.load_default()

FONT = load_font(FONT_SIZE)
SPACE_W = FONT.getbbox(' ')[2] - FONT.getbbox(' ')[0]

# Colors
COL_BG      = (0,   0,   0)      # black background
COL_ACTIVE  = (255, 230, 60)     # yellow — currently spoken word
COL_PAST    = (220, 220, 220)    # light gray — already spoken
COL_FUTURE  = (80,  80,  80)     # dark gray  — not yet spoken (black bg)
if OVERLAY_MODE:
    COL_PAST   = (255, 255, 255) # white on video (already spoken)
    COL_FUTURE = (150, 150, 150) # mid-gray on video (upcoming)
# BAND_HEIGHT is recomputed per frame once we know how many wrapped rows
# the active line needs. Keep a sensible single-line default for callers.
BAND_BASE   = FONT_SIZE + 20
BAND_BOTTOM_PAD = max(20, int(H * 0.05))

# ── Build active-line index for fast lookup ───────────────────────────────────
# For each line, find the active word at a given time
def get_line_at(t):
    """Return the latest line whose start <= t. Returns None before first line."""
    result = None
    for line in lines:
        if line['start'] <= t:
            result = line
        else:
            break
    return result

def active_word_idx(line, t):
    """Index of currently spoken word in line at time t."""
    for i, w in enumerate(line['words']):
        if w['start'] <= t <= w['end']:
            return i
    # Between words — find previous
    for i in range(len(line['words']) - 1, -1, -1):
        if line['words'][i]['end'] <= t:
            return i + 1  # next upcoming word
    return 0

# ── Render a frame ────────────────────────────────────────────────────────────
STYLE = args.style

# Pill style — YouTube-caption look: single rounded translucent pill that hugs
# the text, no per-word highlighting, font shrinks when needed to fit one row.
PILL_FILL_RGBA   = (28, 28, 28, 165)   # near-black, ~65% opaque
PILL_TEXT_RGB    = (255, 255, 255)
PILL_PAD_X_FRAC  = 0.55                # horizontal padding as fraction of font size
PILL_PAD_Y_FRAC  = 0.38                # vertical padding as fraction of font size
PILL_RADIUS_FRAC = 0.30                # corner radius as fraction of pill height
PILL_BOTTOM_FRAC = 0.09                # bottom-edge inset as fraction of frame height
PILL_SAFE_FRAC   = 0.86                # max pill width as fraction of frame width
PILL_MAX_W       = int(W * PILL_SAFE_FRAC)
# Single-line min-shrink floor — below this we prefer a wrapped 2-row pill.
PILL_MIN_FONT    = max(int(FONT_SIZE * 0.72), int(H * 0.040))

# Pre-cache shrunk fonts so we don't reload TTFs every frame.
_FONT_CACHE = {FONT_SIZE: FONT}
def _font_for(size):
    f = _FONT_CACHE.get(size)
    if f is None:
        f = load_font(size)
        _FONT_CACHE[size] = f
    return f

def _measure_with(font, text):
    bbox = font.getbbox(text)
    return bbox[2] - bbox[0]

def _measure(text):
    return _measure_with(FONT, text)

def _wrap_words(words, aidx):
    """Greedy-wrap word list into rows that each fit within SAFE_W (karaoke style)."""
    rows = []
    row, row_w = [], 0
    for i, w in enumerate(words):
        text = w['text']
        tw = _measure(text)
        sw = SPACE_W if row else 0
        if row and row_w + sw + tw > SAFE_W:
            rows.append(row)
            row, row_w = [], 0
            sw = 0
        if i < aidx:    col = COL_PAST
        elif i == aidx: col = COL_ACTIVE
        else:           col = COL_FUTURE
        row.append({'text': text, 'color': col, 'w': tw, 'sw': sw})
        row_w += sw + tw
    if row:
        rows.append(row)
    return rows

def _fit_pill_font(text):
    """Largest cached font where `text` fits one line inside PILL_MAX_W, or None
    if even the minimum single-line font is too wide (caller wraps instead)."""
    size = FONT_SIZE
    while size >= PILL_MIN_FONT:
        f = _font_for(size)
        max_text_w = PILL_MAX_W - 2 * int(size * PILL_PAD_X_FRAC)
        if _measure_with(f, text) <= max_text_w:
            return f
        size -= 2
    return None

def _greedy_wrap(text, font, max_w):
    """Break text into rows that each fit inside max_w using greedy word wrap."""
    words = text.split(' ')
    rows, cur = [], []
    cur_w = 0
    sp_w = _measure_with(font, ' ')
    for w in words:
        ww = _measure_with(font, w)
        if cur and cur_w + sp_w + ww > max_w:
            rows.append(' '.join(cur))
            cur, cur_w = [w], ww
        else:
            cur.append(w)
            cur_w = (cur_w + sp_w + ww) if len(cur) > 1 else ww
    if cur:
        rows.append(' '.join(cur))
    return rows

def _wrap_word_objects(words, font, max_w):
    """Greedy-wrap a list of word dicts (preserving identity) into rows that
    each fit within max_w. Returns list[list[word_dict]]."""
    sp_w = _measure_with(font, ' ')
    rows, cur = [], []
    cur_w = 0
    for w in words:
        ww = _measure_with(font, w['text'])
        if cur and cur_w + sp_w + ww > max_w:
            rows.append(cur)
            cur, cur_w = [w], ww
        else:
            cur.append(w)
            cur_w = (cur_w + sp_w + ww) if len(cur) > 1 else ww
    if cur:
        rows.append(cur)
    return rows

def _render_pill(img, line, t):
    """Rounded translucent caption pill with per-word yellow highlight on the
    currently-spoken word. Auto-shrinks to fit one line, falls back to ≤2 rows."""
    words_obj = line['words']
    text = ' '.join(w['text'] for w in words_obj)
    aidx = active_word_idx(line, t)
    font = _fit_pill_font(text)

    if font is not None:
        rows = [words_obj]
    else:
        # Wrap fallback: pick the largest font that yields at most 2 rows AND
        # fits the longest single word. Bounds: [PILL_MIN_FONT, FONT_SIZE].
        font, rows = None, None
        size = FONT_SIZE
        while size >= PILL_MIN_FONT:
            f = _font_for(size)
            row_w = PILL_MAX_W - 2 * int(size * PILL_PAD_X_FRAC)
            wrapped = _wrap_word_objects(words_obj, f, row_w)
            longest_word_fits = all(_measure_with(f, w['text']) <= row_w
                                    for w in words_obj)
            if longest_word_fits and len(wrapped) <= 2:
                font, rows = f, wrapped
                break
            size -= 2
        if font is None:
            font = _font_for(PILL_MIN_FONT)
            row_w = PILL_MAX_W - 2 * int(font.size * PILL_PAD_X_FRAC)
            rows = _wrap_word_objects(words_obj, font, row_w)

    ascent, descent = font.getmetrics()
    line_h = ascent + descent
    row_gap = int(line_h * 0.18)
    pad_x = int(font.size * PILL_PAD_X_FRAC)
    pad_y = int(font.size * PILL_PAD_Y_FRAC)
    sp_w = _measure_with(font, ' ')

    # Measure each row's pixel width (words + interword spaces)
    def row_width(row):
        return sum(_measure_with(font, w['text']) for w in row) + sp_w * max(0, len(row) - 1)
    row_widths = [row_width(r) for r in rows]
    text_w = max(row_widths)
    text_h = len(rows) * line_h + max(0, len(rows) - 1) * row_gap

    pill_w = text_w + 2 * pad_x
    pill_h = text_h + 2 * pad_y
    radius = int((line_h + 2 * pad_y) * PILL_RADIUS_FRAC)

    pill_x = (W - pill_w) // 2
    pill_y = H - pill_h - int(H * PILL_BOTTOM_FRAC)

    overlay = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(overlay).rounded_rectangle(
        [(pill_x, pill_y), (pill_x + pill_w, pill_y + pill_h)],
        radius=radius, fill=PILL_FILL_RGBA,
    )
    if img.mode != 'RGBA':
        img = img.convert('RGBA')
    img = Image.alpha_composite(img, overlay)

    # Per-word draw with active-word highlight
    draw = ImageDraw.Draw(img)
    y = pill_y + pad_y - int(descent * 0.15)
    word_global_idx = 0
    for row, rw in zip(rows, row_widths):
        x = pill_x + (pill_w - rw) // 2
        for j, w in enumerate(row):
            color = COL_ACTIVE if word_global_idx == aidx else PILL_TEXT_RGB
            draw.text((x, y), w['text'], font=font, fill=color)
            x += _measure_with(font, w['text'])
            if j < len(row) - 1:
                x += sp_w
            word_global_idx += 1
        y += line_h + row_gap

    return img.convert('RGB')

def _render_karaoke(img, line, t):
    """Original karaoke style — word-by-word color, multi-row wrap, translucent band."""
    wds = line['words']
    aidx = active_word_idx(line, t)
    rows = _wrap_words(wds, aidx)
    if not rows:
        return img

    line_h = FONT_SIZE + LINE_SPACING
    text_block_h = len(rows) * line_h - LINE_SPACING
    band_h = text_block_h + BAND_BASE
    band_top = H - band_h - BAND_BOTTOM_PAD

    overlay = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(overlay).rectangle(
        [(0, band_top), (W, H)], fill=(0, 0, 0, 160)
    )
    if img.mode != 'RGBA':
        img = img.convert('RGBA')
    img = Image.alpha_composite(img, overlay).convert('RGB')

    draw = ImageDraw.Draw(img)
    y = band_top + (BAND_BASE // 2) - (LINE_SPACING // 2)
    for row in rows:
        row_w = sum(seg['w'] + seg['sw'] for seg in row)
        x = (W - row_w) // 2
        for seg in row:
            x += seg['sw']
            draw.text((x, y), seg['text'], font=FONT, fill=seg['color'])
            x += seg['w']
        y += line_h

    return img

def render_frame(t, base_img=None):
    if base_img:
        img = base_img.copy()
    else:
        img = Image.new('RGB', (W, H), COL_BG)

    line = get_line_at(t)
    if line is None or t > line['end']:
        return img

    if STYLE == 'pill':
        return _render_pill(img, line, t)
    return _render_karaoke(img, line, t)

# ── Video frame reader (overlay mode) ─────────────────────────────────────────
video_reader = None
if OVERLAY_MODE:
    # Decode video to raw RGB frames via ffmpeg pipe
    video_reader = subprocess.Popen(
        ['ffmpeg', '-i', args.video,
         '-f', 'rawvideo', '-pix_fmt', 'rgb24',
         '-v', 'quiet', '-'],
        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL
    )
    FRAME_BYTES = W * H * 3

# ── Pipe frames to ffmpeg ─────────────────────────────────────────────────────
ffmpeg_cmd = [
    'ffmpeg', '-y',
    '-f', 'rawvideo',
    '-vcodec', 'rawvideo',
    '-s', f'{W}x{H}',
    '-pix_fmt', 'rgb24',
    '-r', str(FPS),
    '-i', 'pipe:0',
    '-i', AUDIO_INPUT,
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '18',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-t', str(DURATION),
    args.output,
]

print(f"\nRendering {TOTAL_FRAMES} frames → {args.output}")
proc = subprocess.Popen(ffmpeg_cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE)

try:
    for frame_num in range(TOTAL_FRAMES):
        t = frame_num / FPS

        base_img = None
        if video_reader:
            raw = video_reader.stdout.read(FRAME_BYTES)
            if len(raw) == FRAME_BYTES:
                base_img = Image.frombytes('RGB', (W, H), raw)

        img = render_frame(t, base_img)
        proc.stdin.write(img.tobytes())

        if frame_num % (FPS * 10) == 0:
            pct = frame_num / TOTAL_FRAMES * 100
            print(f"  {pct:.0f}%  t={t:.1f}s", flush=True)

    # Python 3.12: communicate() flushes stdin even when already closed,
    # raising ValueError. Read stderr + wait() directly instead.
    try:
        proc.stdin.flush()
    except Exception:
        pass
    proc.stdin.close()
    stderr_data = proc.stderr.read() if proc.stderr else b""
    proc.wait()
    if proc.returncode != 0:
        sys.stderr.write(stderr_data.decode(errors='replace'))
except BrokenPipeError:
    sys.stderr.write("ffmpeg pipe closed early\n")
    try:
        stderr_data = proc.stderr.read() if proc.stderr else b""
    except Exception:
        stderr_data = b""
    proc.wait()
    sys.stderr.write(stderr_data.decode(errors='replace'))

if video_reader:
    video_reader.terminate()

if proc.returncode != 0:
    sys.exit(f"ffmpeg exited with code {proc.returncode}")

print(f"\nDone! → {args.output}")
