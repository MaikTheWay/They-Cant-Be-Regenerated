from PIL import Image, ImageDraw

image = Image.new('RGB', (1200, 800), '#334d42')
draw = ImageDraw.Draw(image)
for offset in range(-400, 1400, 80):
    draw.line((offset, 0, offset + 800, 800), fill='#d1ff4a', width=12)
draw.ellipse((380, 170, 820, 610), fill='#f5a65b', outline='#101113', width=18)
draw.text((460, 360), 'TEST ART', fill='#101113')
image.save('/home/ubuntu/they-cant-be-regenerated/test-assets/test-art.png')
