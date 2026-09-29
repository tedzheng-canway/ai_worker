import importlib.util
from pathlib import Path

import pytest
from PIL import Image

spec = importlib.util.spec_from_file_location('make_icon', Path(__file__).parents[1] / 'packaging/make_icon.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def test_icon_fallback_and_local_override(tmp_path):
    assets = tmp_path / 'assets'
    assets.mkdir()
    target = tmp_path / 'output'
    for name, color in [('AIworker_logo.png', (255, 0, 0, 255)), ('logo.png', (0, 0, 255, 255))]:
        Image.new('RGBA', (256, 256), color).save(assets / name)
        assert module.make_icon(assets, target) == assets / name
        with Image.open(target / 'icon.ico') as icon:
            assert icon.getpixel((128, 128)) == color


def test_missing_both_logos_has_clear_error(tmp_path):
    with pytest.raises(FileNotFoundError, match='Missing logo.png or AIworker_logo.png'):
        module.make_icon(tmp_path, tmp_path / 'output')
