"""Cut Mario frames out of the SMW sprite rip into a uniform Kontra-friendly sheet.

Usage:
    python3 -I tools/build_mario_sheet.py <smw_mario_sheet.png> assets/mario.png [preview.png]

Every output frame is a CELL x CELL cell. Mario's body is centred horizontally and his
feet sit on the bottom row, so the sprite can be flipped (scaleX = -1) with anchor
{x: 0.5, y: 1} without shifting. All frames face right.

No dependencies: reads 8-bit palette PNGs and writes RGBA PNGs with zlib only.
"""
import struct
import sys
import zlib

CELL = 48

# name, rough source rect (x, y, w, h), flip to face right, body centre x in source
# (None = centre of the tight bounding box). Rects come from the 40px grid of the rip.
FRAMES = [
    ('idle',        (168, 76, 16, 28),  True,  None),
    ('walk1',       (48, 76, 16, 28),   True,  None),
    ('walk2',       (8, 76, 16, 28),    True,  None),
    ('climb1',      (114, 715, 16, 29), False, None),
    ('climb2',      (144, 715, 16, 29), False, None),
    ('hammer_up',   (89, 269, 15, 42),  True,  None),
    ('hammer_down', (0, 269, 32, 42),   True,  24),
    ('jump',        (168, 114, 16, 31), True,  None),
    ('fall',        (8, 114, 16, 31),   True,  None),
]


def read_png(path):
    data = open(path, 'rb').read()
    assert data[:8] == b'\x89PNG\r\n\x1a\n', 'not a PNG'
    pos, idat, plte, trns = 8, b'', None, b''
    while pos < len(data):
        length, ctype = struct.unpack('>I4s', data[pos:pos + 8])
        body = data[pos + 8:pos + 8 + length]
        if ctype == b'IHDR':
            w, h, depth, color, _, _, interlace = struct.unpack('>IIBBBBB', body)
        elif ctype == b'PLTE':
            plte = [tuple(body[i:i + 3]) for i in range(0, len(body), 3)]
        elif ctype == b'tRNS':
            trns = body
        elif ctype == b'IDAT':
            idat += body
        pos += 12 + length
    assert depth == 8 and color == 3 and interlace == 0, 'expected 8-bit palette PNG'
    raw = zlib.decompress(idat)
    rows, prev, i = [], bytearray(w), 0
    for _ in range(h):
        f = raw[i]
        line = bytearray(raw[i + 1:i + 1 + w])
        i += 1 + w
        for x in range(w):
            a = line[x - 1] if x else 0
            b = prev[x]
            c = prev[x - 1] if x else 0
            if f == 1:
                line[x] = (line[x] + a) & 255
            elif f == 2:
                line[x] = (line[x] + b) & 255
            elif f == 3:
                line[x] = (line[x] + (a + b) // 2) & 255
            elif f == 4:
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                line[x] = (line[x] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
        rows.append(line)
        prev = line
    rgba = [(*plte[k], trns[k] if k < len(trns) else 255) for k in range(len(plte))]
    return w, h, [[rgba[v] for v in r] for r in rows]


def write_png(path, w, h, px):
    def chunk(t, d):
        return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    raw = b''.join(b'\x00' + b''.join(bytes(p) for p in row) for row in px)
    png = (b'\x89PNG\r\n\x1a\n'
           + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
           + chunk(b'IDAT', zlib.compress(raw, 9))
           + chunk(b'IEND', b''))
    open(path, 'wb').write(png)


def cut(src, rect, flip):
    x0, y0, w, h = rect
    sub = [row[x0:x0 + w] for row in src[y0:y0 + h]]
    opaque = [(x, y) for y in range(h) for x in range(w) if sub[y][x][3]]
    xs, ys = [p[0] for p in opaque], [p[1] for p in opaque]
    tx0, tx1, ty0, ty1 = min(xs), max(xs), min(ys), max(ys)
    tight = [row[tx0:tx1 + 1] for row in sub[ty0:ty1 + 1]]
    if flip:
        tight = [row[::-1] for row in tight]
    return tight, x0 + tx0


def build(src_path, out_path, preview_path=None):
    _, _, src = read_png(src_path)
    clear = (0, 0, 0, 0)
    out = [[clear] * (CELL * len(FRAMES)) for _ in range(CELL)]
    for i, (name, rect, flip, body_x) in enumerate(FRAMES):
        img, left = cut(src, rect, flip)
        fh, fw = len(img), len(img[0])
        assert fh <= CELL and fw <= CELL, f'{name} is {fw}x{fh}, larger than {CELL}'
        centre = fw / 2 if body_x is None else body_x - left
        if flip:
            centre = fw - centre
        ox = i * CELL + round(CELL / 2 - centre)
        oy = CELL - fh
        assert i * CELL <= ox and ox + fw <= (i + 1) * CELL, f'{name} overflows its cell'
        for y in range(fh):
            for x in range(fw):
                if img[y][x][3]:
                    out[oy + y][ox + x] = img[y][x]
        print(f'{i}: {name:12s} {fw}x{fh}')
    write_png(out_path, CELL * len(FRAMES), CELL, out)

    if preview_path:
        # Scaled-up copy on a light background with cell borders, for eyeballing alignment.
        s = 6
        pw, ph = CELL * len(FRAMES) * s, CELL * s
        prev = []
        for y in range(ph):
            row = []
            for x in range(pw):
                if x % (CELL * s) == 0 or y == ph - 1 or (x // s) % CELL == CELL // 2 and y % 4 < 2:
                    row.append((200, 0, 0, 255))
                else:
                    p = out[y // s][x // s]
                    row.append(p if p[3] else (235, 235, 235, 255))
            prev.append(row)
        write_png(preview_path, pw, ph, prev)


if __name__ == '__main__':
    build(*sys.argv[1:4])
