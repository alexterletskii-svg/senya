"""Генерирует src/assets/tray.png (иконка трея): голова Робика."""
from PIL import Image, ImageDraw

S = 64
img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
d.line([(32, 14), (32, 6)], fill=(91, 107, 127, 255), width=3)
d.ellipse([28, 2, 36, 10], fill=(255, 200, 40, 255))
d.rounded_rectangle([8, 14, 56, 56], radius=12, fill=(207, 216, 227, 255), outline=(91, 107, 127, 255), width=3)
d.rounded_rectangle([14, 20, 50, 50], radius=8, fill=(18, 32, 46, 255))
d.ellipse([20, 28, 29, 37], fill=(125, 249, 255, 255))
d.ellipse([35, 28, 44, 37], fill=(125, 249, 255, 255))
d.arc([24, 36, 40, 46], start=20, end=160, fill=(125, 249, 255, 255), width=2)
img.save("src/assets/tray.png")
