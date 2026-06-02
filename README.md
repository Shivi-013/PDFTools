<div align="center">

# 🔧 PDFTools

**A free, privacy-first PDF toolkit — no accounts, no watermarks, no files stored.**

[![Python](https://img.shields.io/badge/Python-3.10%2B-3776ab?logo=python&logoColor=white)](https://www.python.org/)
[![Flask](https://img.shields.io/badge/Flask-3.x-black?logo=flask&logoColor=white)](https://flask.palletsprojects.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.x-38bdf8?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

[**Live Demo**](http://localhost:5000) · [**Report a Bug**](../../issues) · [**Request a Feature**](../../issues)

</div>

---

## What is PDFTools?

PDFTools is an all-in-one web app for working with PDF files. It runs entirely in your browser with a Python/Flask backend — no cloud uploads, no subscriptions, no tracking. Every file is processed in memory and discarded the moment your download starts.

---

## Tools

| # | Tool | What it does |
|---|------|---|
| 1 | **Merge PDFs** | Pick pages visually via thumbnail grid, drag them into order, rotate per page, then download one merged PDF |
| 2 | **Split PDF** | Split by custom page ranges (`1-3, 5-8`) or every N pages — returns a PDF or a ZIP |
| 3 | **Compress PDF** | Lossless compression via content-stream rewrite — shows original size, compressed size, and % saved |
| 4 | **Images → PDF** | Upload JPG/PNG files, drag to reorder, convert to a single PDF |
| 5 | **PDF → Images** | Render each page as PNG or JPEG at 1×/2×/3× scale, download as ZIP |
| 6 | **Watermark** | Stamp any text on every page — control position, opacity, rotation, and font size |
| 7 | **Protect PDF** | Encrypt a PDF with a password using AES via pypdf |
| 8 | **Metadata Editor** | Read and overwrite title, author, subject, and keywords |

---

## Tech Stack

<table>
<tr>
<td valign="top" width="50%">

**Backend**
- [Flask 3](https://flask.palletsprojects.com/) — routing and request handling
- [pypdf 6](https://pypdf.readthedocs.io/) — PDF read / write / merge / split / encrypt / metadata
- [Pillow 12](https://pillow.readthedocs.io/) — image → PDF conversion
- [ReportLab 4](https://www.reportlab.com/) — watermark text layer generation

</td>
<td valign="top" width="50%">

**Frontend**
- [Tailwind CSS](https://tailwindcss.com/) — utility-first UI, dark / light mode
- [PDF.js 3](https://mozilla.github.io/pdf.js/) — client-side page thumbnail rendering
- [SortableJS](https://sortablejs.github.io/Sortable/) — drag-to-reorder merge queue and image grid
- [JSZip](https://stuk.github.io/jszip/) — client-side ZIP for PDF → Images

</td>
</tr>
</table>

---

## Quick Start

```bash
# 1. Clone
git clone https://github.com/gupta-ananya009/pdftools.git
cd pdftools

# 2. Create a virtual environment
python -m venv venv
source venv/bin/activate      # macOS / Linux
venv\Scripts\activate         # Windows

# 3. Install dependencies
pip install -r requirements.txt

# 4. Run
python app.py
```

Open **http://localhost:5000** — the landing page loads instantly, no configuration needed.

---

## Project Structure

```
pdftools/
│
├── app.py                   # All Flask routes + PDF processing logic
├── requirements.txt
│
├── templates/
│   ├── base.html            # Sidebar layout, dark-mode toggle, mobile nav
│   ├── landing.html         # Marketing landing page (standalone, no sidebar)
│   ├── merge.html
│   ├── split.html
│   ├── compress.html
│   ├── img2pdf.html
│   ├── pdf2img.html
│   ├── watermark.html
│   ├── protect.html
│   └── metadata.html
│
└── static/
    ├── css/
    │   └── app.css          # Scrollbars, animations, Tailwind supplements
    └── js/
        ├── app.js           # Shared: dark mode, toasts, drop-zone helper, XHR wrapper
        ├── merge.js         # PDF.js thumbnails · SortableJS queue · per-page rotation
        ├── split.js
        ├── compress.js      # Reads X-Original-Size / X-Compressed-Size headers
        ├── img2pdf.js       # Image grid with SortableJS reorder
        ├── pdf2img.js       # PDF.js render → JSZip → download
        ├── watermark.js
        ├── protect.js
        └── metadata.js      # Reads metadata via /api/metadata/info before form pre-fill
```

---

## API Reference

All endpoints accept `multipart/form-data` and return a file download or `{ "error": "..." }` JSON on failure.

### Merge
```
POST /api/merge
```
| Field | Type | Description |
|---|---|---|
| `pdfs[]` | File[] | PDF files (order = file index 0, 1, 2…) |
| `file_indices[]` | int[] | Which PDF each queue item belongs to |
| `page_nums[]` | int[] | 1-indexed page number for each queue item |
| `rotations[]` | int[] | Rotation in degrees (0, 90, 180, 270) |

Returns `merged.pdf`.

### Split
```
POST /api/split
```
| Field | Type | Description |
|---|---|---|
| `pdf` | File | Source PDF |
| `mode` | string | `ranges` or `every_n` |
| `ranges` | string | e.g. `1-3, 5-8` (used when `mode=ranges`) |
| `n` | int | Pages per chunk (used when `mode=every_n`) |

Returns `split.pdf` (single range) or `split.zip` (multiple parts).

### Compress
```
POST /api/compress
```
Returns `compressed.pdf` with two extra response headers:

| Header | Description |
|---|---|
| `X-Original-Size` | Original size in bytes |
| `X-Compressed-Size` | Compressed size in bytes |

### Other endpoints

| Endpoint | Input | Output |
|---|---|---|
| `POST /api/img2pdf` | `images[]` (JPG/PNG) | `images.pdf` |
| `POST /api/watermark` | `pdf`, `text`, `opacity`, `rotation`, `fontsize`, `position` | `watermarked.pdf` |
| `POST /api/protect` | `pdf`, `password` | `protected.pdf` |
| `POST /api/metadata/info` | `pdf` | JSON `{title, author, subject, keywords, pages}` |
| `POST /api/metadata/save` | `pdf`, `title`, `author`, `subject`, `keywords` | `updated.pdf` |

---

## Privacy

| Guarantee | Detail |
|---|---|
| **No storage** | Files are read into `io.BytesIO`, processed, and never written to disk |
| **No tracking** | No analytics, cookies, or third-party scripts (all CDN assets are read-only) |
| **No accounts** | Open the app and start working — nothing to sign up for |
| **No watermarks** | The output is your file, unmodified except for what you asked |

---

## Requirements

```
flask>=3.0.0
pypdf>=4.0.0
Pillow>=10.0.0
reportlab>=4.0.0
```

Tested on **Python 3.10 / 3.11 / 3.12**.

---

## Contributing

Contributions are welcome. To propose a new tool or fix a bug:

1. Fork the repository
2. Create a branch: `git checkout -b feature/my-tool`
3. Commit: `git commit -m 'Add my tool'`
4. Push: `git push origin feature/my-tool`
5. Open a Pull Request

For larger changes, open an issue first so we can discuss the design.

---

## License

[MIT](LICENSE) — free to use, modify, and distribute.
