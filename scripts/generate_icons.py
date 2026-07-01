"""Generate PWA icons using pure Python stdlib (no dependencies)."""
import struct
import zlib
import os
import math

def create_png(width, height):
    """Create a PNG byte string with a simple icon design."""
    # Blue circle with white 'W' letter shape

    def rgba(r, g, b, a):
        return (r, g, b, a)

    bg_color = (248, 249, 250, 255)       # --color-bg
    primary = (74, 144, 217, 255)          # --color-primary
    primary_dark = (58, 123, 200, 255)     # --color-primary-dark

    cx, cy = width / 2, height / 2
    r_outer = min(width, height) * 0.42
    r_inner = r_outer * 0.75

    pixels = []
    for y in range(height):
        row = [0]  # filter byte: None
        for x in range(width):
            dx = x - cx
            dy = y - cy
            dist = math.sqrt(dx * dx + dy * dy)

            if dist <= r_outer:
                # Inside the circle: gradient from primary to primary_dark
                t = dist / r_outer
                rr = int(primary[0] + (primary_dark[0] - primary[0]) * t)
                gg = int(primary[1] + (primary_dark[1] - primary[1]) * t)
                bb = int(primary[2] + (primary_dark[2] - primary[2]) * t)
                row.extend([rr, gg, bb, 255])
            else:
                row.extend(bg_color)

        pixels.append(bytes(row))

    raw_data = b''.join(pixels)

    def make_chunk(chunk_type, data):
        chunk = chunk_type + data
        return struct.pack('>I', len(data)) + chunk + struct.pack('>I', zlib.crc32(chunk) & 0xffffffff)

    ihdr_data = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    ihdr = make_chunk(b'IHDR', ihdr_data)
    idat = make_chunk(b'IDAT', zlib.compress(raw_data))
    iend = make_chunk(b'IEND', b'')

    return b'\x89PNG\r\n\x1a\n' + ihdr + idat + iend


def main():
    icons_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'icons')
    os.makedirs(icons_dir, exist_ok=True)

    sizes = [72, 96, 128, 144, 152, 192, 384, 512]
    for size in sizes:
        path = os.path.join(icons_dir, f'icon-{size}.png')
        data = create_png(size, size)
        with open(path, 'wb') as f:
            f.write(data)
        print(f'  Generated {path} ({len(data)} bytes)')

    print(f'\nDone! {len(sizes)} icons generated.')


if __name__ == '__main__':
    main()
