from pathlib import Path
from PIL import Image, ImageOps

def make_icon(assets: Path, target: Path) -> Path:
    logo = next((assets / name for name in ('logo.png', 'AIworker_logo.png')
                 if (assets / name).is_file()), None)
    if logo is None:
        raise FileNotFoundError(f'Missing logo.png or AIworker_logo.png in {assets}')
    target.mkdir(parents=True, exist_ok=True)
    with Image.open(logo) as source:
        icon = ImageOps.pad(source.convert('RGBA'), (256, 256), color=(0, 0, 0, 0))
        icon.save(target / 'icon.ico', sizes=[(n, n) for n in (16, 24, 32, 48, 64, 128, 256)])
    return logo


if __name__ == '__main__':
    root = Path(__file__).resolve().parent.parent
    print(f"Icon source: {make_icon(root / 'surfaces_vue/assets', root / 'build/desktop')}")
