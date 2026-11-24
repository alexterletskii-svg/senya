"""Генерирует src/assets/tray.png (иконка трея): парящий экран Робика."""
from PIL import Image, ImageDraw

S = 64
img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
d.line([(32, 12), (32, 5)], fill=(85, 71, 201, 255), width=3)
d.ellipse([28, 1, 36, 9], fill=(255, 184, 77, 255))
d.rounded_rectangle([4, 12, 60, 56], radius=18, fill=(108, 92, 231, 255))
d.rounded_rectangle([11, 19, 53, 49], radius=11, fill=(10, 15, 20, 255))
d.rounded_rectangle([19, 27, 28, 42], radius=3, fill=(255, 184, 77, 255))
d.rounded_rectangle([36, 27, 45, 42], radius=3, fill=(255, 184, 77, 255))
img.save("src/assets/tray.png")
