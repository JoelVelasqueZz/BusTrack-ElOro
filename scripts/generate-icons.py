from PIL import Image, ImageDraw, ImageFont
import qrcode
from qrcode.constants import ERROR_CORRECT_H

NAVY = (26, 43, 74, 255)
RED = (230, 57, 70, 255)
WHITE = (255, 255, 255, 255)
BLACK = (26, 26, 26, 255)
GRAY = (212, 212, 216, 255)


def draw_bus_icon(size, background=NAVY):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    s = size / 64

    def r(x, y, w, h, radius, fill):
        draw.rounded_rectangle([x * s, y * s, (x + w) * s, (y + h) * s], radius=radius * s, fill=fill)

    def c(cx, cy, radius, fill):
        draw.ellipse(
            [(cx - radius) * s, (cy - radius) * s, (cx + radius) * s, (cy + radius) * s], fill=fill
        )

    if background is not None:
        r(0, 0, 64, 64, 12, background)
    r(8, 14, 48, 32, 6, RED)
    r(12, 20, 16, 12, 2, WHITE)
    r(32, 20, 16, 12, 2, WHITE)
    r(8, 38, 48, 6, 0, BLACK)
    c(18, 50, 6, BLACK)
    c(18, 50, 2.5, GRAY)
    c(46, 50, 6, BLACK)
    c(46, 50, 2.5, GRAY)
    return img


def generate_app_icons():
    for size, name in [(512, "icon-512.png"), (192, "icon-192.png")]:
        draw_bus_icon(size).save(f"public/{name}")
    draw_bus_icon(180).convert("RGB").save("public/apple-touch-icon.png")


def generate_qr_card(url, out_path):
    # H = máxima corrección de errores: tolera ~30% de módulos tapados,
    # así el logo del centro no arriesga que el QR falle al escanear.
    qr = qrcode.QRCode(error_correction=ERROR_CORRECT_H, box_size=14, border=2)
    qr.add_data(url)
    qr.make(fit=True)
    qr_img = qr.make_image(fill_color=NAVY[:3], back_color=WHITE[:3]).convert("RGBA")

    # logo circular en el centro, dentro del margen que la corrección H tolera
    logo_size = int(qr_img.width * 0.22)
    pad = int(logo_size * 0.18)
    badge = Image.new("RGBA", (logo_size + pad * 2, logo_size + pad * 2), (0, 0, 0, 0))
    ImageDraw.Draw(badge).ellipse([0, 0, badge.width, badge.height], fill=WHITE)
    bus = draw_bus_icon(logo_size, background=NAVY)
    badge.paste(bus, (pad, pad), bus)
    qr_img.alpha_composite(
        badge, ((qr_img.width - badge.width) // 2, (qr_img.height - badge.height) // 2)
    )

    # tarjeta blanca alrededor con título/leyenda, para mostrar en pantalla
    pad_x, pad_top, pad_bottom = 60, 60, 100
    title_font = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 46)
    subtitle_font = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 30)
    url_font = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 26)

    title = "BusTrack El Oro"
    subtitle = "Escanea para probar la app"

    card_w = qr_img.width + pad_x * 2
    card_h = pad_top + 60 + qr_img.height + 20 + subtitle_font.size + 16 + url_font.size + pad_bottom
    card = Image.new("RGB", (card_w, card_h), WHITE[:3])
    draw = ImageDraw.Draw(card)

    tb = draw.textbbox((0, 0), title, font=title_font)
    draw.text(((card_w - (tb[2] - tb[0])) // 2, pad_top), title, font=title_font, fill=NAVY[:3])

    qr_y = pad_top + 60
    card.paste(qr_img, ((card_w - qr_img.width) // 2, qr_y), qr_img)

    sb = draw.textbbox((0, 0), subtitle, font=subtitle_font)
    sub_y = qr_y + qr_img.height + 20
    draw.text(((card_w - (sb[2] - sb[0])) // 2, sub_y), subtitle, font=subtitle_font, fill=BLACK[:3])

    ub = draw.textbbox((0, 0), url, font=url_font)
    url_y = sub_y + subtitle_font.size + 16
    draw.text(((card_w - (ub[2] - ub[0])) // 2, url_y), url, font=url_font, fill=(110, 110, 116))

    # marco delgado en el color de marca
    ImageDraw.Draw(card).rounded_rectangle(
        [4, 4, card_w - 5, card_h - 5], radius=28, outline=NAVY[:3], width=4
    )
    card.save(out_path)


if __name__ == "__main__":
    generate_app_icons()
    generate_qr_card("https://bustrack-el-oro.web.app", "docs/IMGS/qr-bustrack-demo.png")
    print("done")
