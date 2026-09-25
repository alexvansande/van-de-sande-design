"""Rectify page 190 of The Infinite Machine (photo 2) with a per-line mesh warp
and extract the print as an ink-alpha layer placed on the blank page scan."""
from PIL import Image, ImageFilter, ImageChops
import statistics, json, os, sys

S = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1] if len(sys.argv) > 1 else S
os.makedirs(OUT, exist_ok=True)

th = Image.open(f'{S}/th.png')
ink = Image.open(f'{S}/ink_raw.png')


def bands(x0, x1, y0, y1, thr=2, minh=20):
    r = th.crop((x0, y0, x1, y1))
    p = r.resize((1, r.size[1]), Image.BOX)
    v = [p.getpixel((0, y)) for y in range(r.size[1])]
    out, inb = [], False
    for y, val in enumerate(v):
        if val > thr and not inb:
            inb, ys = True, y
        elif val <= thr and inb:
            inb = False
            if y - ys >= minh:
                out.append((ys + y0 + y + y0) / 2)
    return out


# ---- 1. line centres per vertical strip, assigned to line indices 1..34 -----
NL = 34
XS = list(range(850, 2401, 50))
Y = {}  # Y[xc][j] = source y of line j centre at strip xc
for xc in XS:
    b = bands(xc - 60, xc + 60, 500, 3340)
    diffs = [b[i + 1] - b[i] for i in range(len(b) - 1)]
    pitch = statistics.median([d for d in diffs if d < 100]) if diffs else 80
    lines = {}
    j = NL
    lines[j] = b[-1]
    for i in range(len(b) - 2, -1, -1):
        gap = b[i + 1] - b[i]
        j -= max(1, round(gap / pitch))
        if j >= 1:
            lines[j] = b[i]
    Y[xc] = lines

# ---- 1b. one smooth model for line position: y = A(x) + B(x) * j ----------
# A is a quartic in x, B a cubic; fitted to every measured (strip, line) point.
def basis(x, j):
    u = (x - 1600) / 800
    return [1, u, u**2, u**3, u**4, j, j*u, j*u**2, j*u**3]

def solve(A, B):
    n = len(B); M = [row[:] + [B[i]] for i, row in enumerate(A)]
    for c in range(n):
        piv = max(range(c, n), key=lambda r: abs(M[r][c])); M[c], M[piv] = M[piv], M[c]
        for r in range(n):
            if r != c:
                f = M[r][c] / M[c][c]
                M[r] = [a - f * b for a, b in zip(M[r], M[c])]
    return [M[i][n] / M[i][i] for i in range(n)]

pts = [(xc, j, y) for xc in XS for j, y in Y[xc].items()]
K = len(basis(0, 0))
def lsq(pts):
    N = [[0.0] * K for _ in range(K)]; R = [0.0] * K
    for x, j, y in pts:
        b = basis(x, j)
        for a in range(K):
            R[a] += b[a] * y
            for c in range(K):
                N[a][c] += b[a] * b[c]
    return solve(N, R)
co = lsq(pts)
model = lambda x, j: sum(c * b for c, b in zip(co, basis(x, j)))
res = [y - model(x, j) for x, j, y in pts]
# drop outliers (bands hit by punctuation only, etc.) and refit once
keep = [pt for pt, r in zip(pts, res) if abs(r) < 12]
co = lsq(keep)
res = [y - model(x, j) for x, j, y in keep]
rms = (sum(r * r for r in res) / len(res)) ** .5
print('model fit: %d points, %d kept, rms %.2f px, max %.1f px' % (len(pts), len(keep), rms, max(abs(r) for r in res)))
# worst strips
for xc in XS[::4]:
    rr = [y - model(x, j) for x, j, y in keep if x == xc]
    print('  strip', xc, 'rms %.2f' % ((sum(r*r for r in rr)/len(rr))**.5))

# ---- 2. left / right text-block edges as quadratics in source y ------------
L_pts, R_pts = [], []
for j in range(1, NL + 1):
    ymin = min(model(xc, j) for xc in XS) - 28
    ymax = max(model(xc, j) for xc in XS) + 28
    bb = th.crop((600, int(ymin), 2440, int(ymax))).getbbox()
    if not bb:
        continue
    l, r = bb[0] + 600, bb[2] + 600
    if r - l > 1500:
        L_pts.append((model(XS[0], j), l)); R_pts.append((model(XS[-1], j), r))
print('full lines used for edges:', len(L_pts))


def quadfit(pts):
    # least squares x = a + b*y + c*y^2 with y scaled
    ys = [p[0] / 1000 for p in pts]; xs = [p[1] for p in pts]
    import itertools
    A = [[sum(y ** (i + k) for y in ys) for k in range(3)] for i in range(3)]
    B = [sum(x * y ** i for x, y in zip(xs, ys)) for i in range(3)]
    # gaussian elimination
    M = [row[:] + [B[i]] for i, row in enumerate(A)]
    for c in range(3):
        piv = max(range(c, 3), key=lambda r: abs(M[r][c])); M[c], M[piv] = M[piv], M[c]
        for r in range(3):
            if r != c:
                f = M[r][c] / M[c][c]
                M[r] = [a - f * b for a, b in zip(M[r], M[c])]
    co = [M[i][3] / M[i][i] for i in range(3)]
    return lambda y: co[0] + co[1] * (y / 1000) + co[2] * (y / 1000) ** 2


Lfit, Rfit = quadfit(L_pts), quadfit(R_pts)
print('L at 600/3300:', round(Lfit(600)), round(Lfit(3300)), ' R:', round(Rfit(600)), round(Rfit(3300)))


# ---- 3. mapping from target (blank page) coords to source coords -----------
TW, TH = 1861, 3143          # blank page scan
X0, X1 = 214, 1728           # text block in target
PITCH = 74.6
Y1 = 336                     # centre of line 1 in target


def ysrc(x, jf):
    """source y of fractional line jf at source x, from the smooth model."""
    return model(min(2450, max(780, x)), jf)


def src(u, v):
    t = (u - X0) / (X1 - X0)
    jf = 1 + (v - Y1) / PITCH
    yl = ysrc(XS[0], jf); yr = ysrc(XS[-1], jf)
    xl, xr = Lfit(yl), Rfit(yr)
    x = xl + (xr - xl) * t
    return x, ysrc(x, jf)


# build mesh
CW, CH = 31, 33
mesh = []
for gy in range(0, TH, CH):
    for gx in range(0, TW, CW):
        x1, y1 = min(TW, gx + CW), min(TH, gy + CH)
        q = src(gx, gy) + src(gx, y1) + src(x1, y1) + src(x1, gy)
        mesh.append(((gx, gy, x1, y1), q))

# ---- 4. ink alpha in source, then warp -------------------------------------
# darkness statistics inside the block to normalise alpha
blk = ink.crop((900, 600, 2300, 3200))
hist = blk.histogram()
tot = sum(hist[40:]); acc = 0; K = 200
for v in range(40, 256):
    acc += hist[v]
    if acc >= tot * 0.72:
        K = v; break
print('ink 85th percentile darkness K =', K)
FLOOR = 18
GAMMA = 0.75   # <1 lifts mid tones: heavier, higher-contrast ink
alpha = ink.point(lambda v: 0 if v <= FLOOR else int(255 * min(1.0, (v - FLOOR) / (K - FLOOR)) ** GAMMA))
alpha_t = alpha.transform((TW, TH), Image.MESH, mesh, Image.BICUBIC)

# mask to text block + running head + page number
from PIL import ImageDraw
mask = Image.new('L', (TW, TH), 0)
d = ImageDraw.Draw(mask)
ytop = Y1 - PITCH * 0.62; ybot = Y1 + (NL - 1) * PITCH + PITCH * 0.62
d.rectangle((X0 - 12, ytop, X1 + 12, ybot), fill=255)
head = (X0 - 12, Y1 - 2.65 * PITCH, X0 + 800, Y1 - 1.35 * PITCH)
d.rectangle(head, fill=255)
pnum = (X0 - 12, Y1 + (NL + 0.15) * PITCH, X0 + 180, Y1 + (NL + 1.3) * PITCH)
d.rectangle(pnum, fill=255)
alpha_t = ImageChops.multiply(alpha_t, mask)

# report where things landed
def bbox_in(box):
    b = alpha_t.crop(tuple(int(v) for v in box)).point(lambda v: 255 if v > 90 else 0).getbbox()
    return (b[0] + int(box[0]), b[1] + int(box[1]), b[2] + int(box[0]), b[3] + int(box[1])) if b else None
print('running head bbox', bbox_in(head))
print('page number bbox', bbox_in(pnum))
geom = {'W': TW, 'H': TH, 'pitch': PITCH, 'y1': Y1, 'x0': X0, 'x1': X1, 'lines': {}}
for j in range(1, NL + 1):
    yc = Y1 + (j - 1) * PITCH
    b = bbox_in((X0 - 12, yc - 30, X1 + 12, yc + 30))
    geom['lines'][j] = {'yc': yc, 'bbox': b}
    if j <= 6 or j >= 33:
        print('line', j, 'yc', round(yc), 'bbox', b)
geom['head'] = bbox_in(head); geom['pnum'] = bbox_in(pnum)
json.dump(geom, open(f'{OUT}/geometry.json', 'w'), indent=1)

# split passage (head + lines 1..5) from the rest
split_y = int(Y1 + 4.5 * PITCH)
pas = alpha_t.copy(); pas.paste(0, (0, split_y, TW, TH))
rest = alpha_t.copy(); rest.paste(0, (0, 0, TW, split_y))
INK = (28, 24, 22)
# luminance masks for the site: white = ink
pas.save(f'{OUT}/ink_passage_mask.png', optimize=True)
rest.save(f'{OUT}/ink_rest_mask.png', optimize=True)

# composite preview
blank = Image.open('/Users/avsa/Dev/Van de Sande Design /References/blank page.png').convert('RGB')
paper = blank.copy()
inkc = Image.new('RGB', (TW, TH), INK)
paper.paste(inkc, (0, 0), alpha_t)
paper.resize((620, 1047)).save(f'{S}/preview_small.jpg', quality=85)
paper.crop((150, 120, 1750, 800)).save(f'{S}/preview_top.jpg', quality=90)
paper.crop((1100, 2400, 1800, 3000)).save(f'{S}/preview_br.jpg', quality=90)
print('done')
