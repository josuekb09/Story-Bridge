from pathlib import Path
from PIL import Image, ImageOps
import json

ROOT = Path(__file__).resolve().parents[1]
FILES = [
    'Rep._dem._del_congo,_luluwa,_maschera,_xx_sec.jpg',
    'Statue_Luluwa-Musée_ethnologique_de_Berlin.jpg',
    'Statuette_Lulua.jpg',
    'Brooklyn_Museum_22.1448_Figure_of_a_Squatting_Male.jpg',
]
source = ROOT / 'public/assets/photos/lulua'
target = source / 'web'
target.mkdir(parents=True, exist_ok=True)
report = []
for name in FILES:
    src, dst = source / name, target / name
    with Image.open(src) as opened:
        image = ImageOps.exif_transpose(opened).convert('RGB')
        if image.width > 1200:
            height = round(image.height * 1200 / image.width)
            image = image.resize((1200, height), Image.Resampling.LANCZOS)
        image.save(dst, 'JPEG', quality=82, optimize=True)
        report.append({'file': name, 'original_bytes': src.stat().st_size, 'web_bytes': dst.stat().st_size,
                       'original_dimensions': opened.size, 'web_dimensions': image.size})
print(json.dumps(report, ensure_ascii=False, indent=2))
