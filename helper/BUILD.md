### Building Binaries

```bash
# PyInstaller (faster build)
pyinstaller --onefile --name metadata-extractor cli.py

# Nuitka (better performance)
python -m nuitka --onefile --output-filename=metadata-extractor.exe cli.py
```