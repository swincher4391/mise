"""Compose Chrome Web Store screenshots (1280x800) from captured UI."""
from PIL import Image, ImageDraw, ImageFont

GREEN = (45, 80, 22)
CREAM = (245, 243, 236)
WHITE = (255, 255, 255)
MUTED = (150, 190, 120)
INK = (42, 42, 36)

BOLD = r"C:\Windows\Fonts\segoeuib.ttf"
BODY = r"C:\Windows\Fonts\segoeui.ttf"
BLACK = r"C:\Windows\Fonts\seguibl.ttf"

SCRATCH = r"C:\Users\swinc\AppData\Local\Temp\claude\C--dev-Mise\3caec126-27e5-4599-9010-dccafc284fe2\scratchpad"
OUT = r"C:\dev\Mise\build"

def font(p, s): return ImageFont.truetype(p, s)

def shot1():
    """Extension popup on brand background with headline."""
    W, H = 1280, 800
    im = Image.new("RGB", (W, H), GREEN)
    d = ImageDraw.Draw(im)
    # headline left
    d.text((90, 250), "One click,", font=font(BLACK, 88), fill=WHITE)
    d.text((90, 350), "any recipe.", font=font(BLACK, 88), fill=WHITE)
    d.text((94, 480), "Extract the recipe from any page —", font=font(BODY, 30), fill=CREAM)
    d.text((94, 522), "blogs, YouTube, and more — into a", font=font(BODY, 30), fill=CREAM)
    d.text((94, 564), "clean card, without leaving the tab.", font=font(BODY, 30), fill=CREAM)
    # popup on the right, framed like a browser popup
    popup = Image.open(f"{SCRATCH}/popup.png").convert("RGB")
    # crop the useful top portion (header + tabs + button) and scale up
    popup = popup.crop((0, 0, 400, 200)).resize((520, 260), Image.LANCZOS)
    px, py = 700, 270
    # drop shadow
    shadow = Image.new("RGBA", (popup.width + 24, popup.height + 24), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.rounded_rectangle([12, 16, popup.width + 12, popup.height + 16], radius=16, fill=(0, 0, 0, 70))
    im.paste(shadow, (px - 12, py - 12), shadow)
    # rounded popup
    mask = Image.new("L", popup.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, popup.width, popup.height], radius=14, fill=255)
    im.paste(popup, (px, py), mask)
    im.save(f"{OUT}/store-1-popup.png")
    print("wrote store-1-popup.png 1280x800")

def shot2():
    """The resulting clean recipe (reuse the wide app screenshot) with a caption band."""
    W, H = 1280, 800
    app = Image.open(f"{SCRATCH}/desktop-demo.png").convert("RGB") if False else None
    # Use the app's wide screenshot captured earlier into public/
    src = Image.open(r"C:\dev\Mise\public\screenshot-wide.png").convert("RGB")
    im = Image.new("RGB", (W, H), CREAM)
    # fit app screenshot into a framed area
    aw, ah = src.size
    scale = min((W - 160) / aw, (H - 220) / ah)
    src2 = src.resize((int(aw * scale), int(ah * scale)), Image.LANCZOS)
    d = ImageDraw.Draw(im)
    d.text((W // 2, 70), "Just the recipe — no ads, no life story.",
           font=font(BOLD, 40), fill=GREEN, anchor="mm")
    im.paste(src2, ((W - src2.width) // 2, 130))
    im.save(f"{OUT}/store-2-recipe.png")
    print("wrote store-2-recipe.png 1280x800")

shot1()
shot2()
