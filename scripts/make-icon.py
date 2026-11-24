from PIL import Image, ImageDraw


def render(size):
    k = size / 64
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    def b(*v):
        return [round(x * k) for x in v]

    d.line([tuple(b(32, 12)), tuple(b(32, 5))], fill=(85, 71, 201, 255), width=round(3 * k))
    d.ellipse(b(28, 1, 36, 9), fill=(255, 184, 77, 255))
    d.rounded_rectangle(b(4, 12, 60, 56), radius=round(18 * k), fill=(108, 92, 231, 255))
    d.rounded_rectangle(b(11, 19, 53, 49), radius=round(11 * k), fill=(10, 15, 20, 255))
    d.rounded_rectangle(b(19, 27, 28, 42), radius=round(3 * k), fill=(255, 184, 77, 255))
    d.rounded_rectangle(b(36, 27, 45, 42), radius=round(3 * k), fill=(255, 184, 77, 255))
    return img


render(64).save("src/assets/tray.png")
render(512).save("build/icon.png")
