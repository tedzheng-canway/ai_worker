from pathlib import Path
from PyInstaller.utils.hooks import collect_all, collect_data_files, collect_submodules

root = Path(SPECPATH).parent
datas = collect_data_files('coworker', excludes=['testing/**', '**/.idea/**'])
binaries = []
hiddenimports = collect_submodules('coworker', filter=lambda name: not name.startswith('coworker.testing'))
# These libraries load providers/transports and native assets dynamically.
for package in ('aisuite', 'uvicorn', 'playwright', 'pypdfium2', 'pypdfium2_raw'):
    data, binary, hidden = collect_all(package)
    datas += data
    binaries += binary
    hiddenimports += hidden
a = Analysis([str(root / 'packaging/backend_entry.py')], pathex=[str(root)],
             datas=datas, binaries=binaries, hiddenimports=hiddenimports,
             excludes=['pytest', 'coworker.testing'])
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, [], exclude_binaries=True, name='coworker-server',
          console=True, icon=str(root / 'build/desktop/icon.ico'))
coll = COLLECT(exe, a.binaries, a.datas, name='coworker-server')
