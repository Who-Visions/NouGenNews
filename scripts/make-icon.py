"""Builds the desktop app icon from the app's own brand: a gold serif "N" (accent #e8b86d, tokens.css) on the black
masthead background. Writes electron/assets/icon.png (256 px, +@2x 512 px for high-DPI per Electron nativeImage) and
electron/assets/icon.ico with every size Windows asks for (16, 20, 24, 32, 40, 48, 64, 256).
Run: python scripts/make-icon.py   (needs Pillow; uses Georgia Bold from Windows, falls back to Times Bold)."""
import os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "electron", "assets")
GOLD, BLACK, RIM = (232, 184, 109, 255), (0, 0, 0, 255), (58, 46, 26, 255)
ICO_SIZES = [16, 20, 24, 32, 40, 48, 64, 256]

def font(px):
    for f in (r"C:\Windows\Fonts\georgiab.ttf", r"C:\Windows\Fonts\timesbd.ttf"):
        if os.path.exists(f):
            return ImageFont.truetype(f, px)
    return ImageFont.load_default()

def master(size=1024):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = int(size * 0.2)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=BLACK, outline=RIM, width=max(2, size // 64))
    f = font(int(size * 0.74))
    box = d.textbbox((0, 0), "N", font=f)
    w, h = box[2] - box[0], box[3] - box[1]
    d.text(((size - w) / 2 - box[0], (size - h) / 2 - box[1] - size * 0.01), "N", font=f, fill=GOLD)
    return img

if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    m = master()
    m.resize((256, 256), Image.LANCZOS).save(os.path.join(OUT, "icon.png"))
    m.resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, "icon@2x.png"))
    m.save(os.path.join(OUT, "icon.ico"), sizes=[(s, s) for s in ICO_SIZES])
    print("wrote", sorted(os.listdir(OUT)))
