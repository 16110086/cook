### Running from Source

```bash
# Install dependency
pip install gallery-dl

# Run CLI
python cli.py --help

# Timeline mode
python cli.py timeline USERNAME -t TOKEN

# Date range mode
python cli.py daterange USERNAME -t TOKEN -s 2024-01-01 -e 2024-12-31
```

### Building Binaries

```bash
# PyInstaller (faster build)
pyinstaller --onefile --name metadata-extractor cli.py

# Nuitka (better performance)
python -m nuitka --onefile --output-filename=metadata-extractor.exe cli.py
```