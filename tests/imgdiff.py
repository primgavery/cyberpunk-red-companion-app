"""Compare two screenshot sets from tests/visual-tour.js.
    python3 tests/imgdiff.py <labelA> <labelB> [tolerance]
Prints, per screen, the percentage of pixels whose colour differs by more than `tolerance` (0-255, default 0).
Needs Pillow and numpy. Exits 1 if anything differs."""
import sys, glob, os
from PIL import Image
import numpy as np
a, b = sys.argv[1], sys.argv[2]; tol = int(sys.argv[3]) if len(sys.argv) > 3 else 0
d = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.shots'); bad = 0
for fa in sorted(glob.glob(f'{d}/{a}_*.png')):
    n = os.path.basename(fa).split(f'{a}_', 1)[1]; fb = f'{d}/{b}_{n}'
    if not os.path.exists(fb): print('missing', fb); bad += 1; continue
    A = np.asarray(Image.open(fa).convert('RGB')).astype(int); B = np.asarray(Image.open(fb).convert('RGB')).astype(int)
    if A.shape != B.shape: print(f'{n:18s} SIZE DIFFERS {A.shape} vs {B.shape}'); bad += 1; continue
    pct = 100 * (np.abs(A - B).max(axis=2) > tol).mean(); print(f'{n:18s} differing pixels: {pct:.3f}%'); bad += pct > 0
print('IDENTICAL' if not bad else 'DIFFERENCES FOUND'); sys.exit(1 if bad else 0)
