import io
import os
import zipfile
from flask import Flask, render_template, request, send_file, jsonify

try:
    from pypdf import PdfReader, PdfWriter
except ImportError:
    from PyPDF2 import PdfReader, PdfWriter

try:
    from PIL import Image
    HAS_PIL = True
except ImportError:
    HAS_PIL = False

try:
    from reportlab.pdfgen import canvas as rl_canvas
    from reportlab.lib.colors import Color
    HAS_REPORTLAB = True
except ImportError:
    HAS_REPORTLAB = False

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 500 * 1024 * 1024  # 500 MB


# ── Page routes ───────────────────────────────────────────── #

@app.route('/')
def landing():
    return render_template('landing.html')

@app.route('/merge')
def merge():
    return render_template('merge.html', active='merge')

@app.route('/split')
def split():
    return render_template('split.html', active='split')

@app.route('/compress')
def compress():
    return render_template('compress.html', active='compress')

@app.route('/img2pdf')
def img2pdf():
    return render_template('img2pdf.html', active='img2pdf')

@app.route('/pdf2img')
def pdf2img():
    return render_template('pdf2img.html', active='pdf2img')

@app.route('/watermark')
def watermark():
    return render_template('watermark.html', active='watermark')

@app.route('/protect')
def protect():
    return render_template('protect.html', active='protect')

@app.route('/metadata')
def metadata():
    return render_template('metadata.html', active='metadata')


# ── API: Merge ────────────────────────────────────────────── #

@app.route('/api/merge', methods=['POST'])
def api_merge():
    files        = request.files.getlist('pdfs')
    file_indices = [int(x) for x in request.form.getlist('file_indices')]
    page_nums    = [int(x) for x in request.form.getlist('page_nums')]
    rotations    = [int(x) for x in request.form.getlist('rotations')]

    if not files:
        return jsonify({'error': 'No PDF files uploaded.'}), 400
    if not file_indices:
        return jsonify({'error': 'No pages selected for merging.'}), 400

    try:
        # Read every upload into memory so the reader isn't tied to the
        # FileStorage stream (deepcopy on a stream-backed page causes
        # infinite recursion in Python's copy module).
        readers = [PdfReader(io.BytesIO(f.read())) for f in files]
    except Exception as e:
        return jsonify({'error': f'Could not read PDF: {e}'}), 400

    try:
        writer = PdfWriter()
        for fi, pn, rot in zip(file_indices, page_nums, rotations):
            if fi >= len(readers):
                return jsonify({'error': 'Invalid file index.'}), 400
            reader = readers[fi]
            if pn < 1 or pn > len(reader.pages):
                return jsonify({'error': f'Page {pn} out of range.'}), 400
            # add_page clones the page internally — no deepcopy needed
            writer.add_page(reader.pages[pn - 1])
            if rot:
                writer.pages[-1].rotate(int(rot))

        out = io.BytesIO()
        writer.write(out)
        out.seek(0)
        return send_file(out, mimetype='application/pdf',
                         as_attachment=True, download_name='merged.pdf')
    except Exception as e:
        return jsonify({'error': f'Merge failed: {str(e)}'}), 500


# ── API: Split ────────────────────────────────────────────── #

@app.route('/api/split', methods=['POST'])
def api_split():
    f = request.files.get('pdf')
    if not f:
        return jsonify({'error': 'No PDF uploaded.'}), 400

    mode = request.form.get('mode', 'ranges')

    try:
        reader = PdfReader(io.BytesIO(f.read()))
    except Exception as e:
        return jsonify({'error': f'Could not read PDF: {e}'}), 400

    total = len(reader.pages)
    parts = []

    if mode == 'every_n':
        n = int(request.form.get('n', 1))
        if n < 1:
            return jsonify({'error': 'N must be ≥ 1.'}), 400
        for start in range(0, total, n):
            parts.append(list(range(start, min(start + n, total))))

    else:  # ranges
        raw = request.form.get('ranges', '')
        parts = _parse_split_ranges(raw, total)
        if not parts:
            return jsonify({'error': 'No valid page ranges provided.'}), 400

    if not parts:
        return jsonify({'error': 'Nothing to split.'}), 400

    if len(parts) == 1:
        w = PdfWriter()
        for idx in parts[0]:
            w.add_page(reader.pages[idx])
        out = io.BytesIO()
        w.write(out)
        out.seek(0)
        return send_file(out, mimetype='application/pdf',
                         as_attachment=True, download_name='split.pdf')

    zip_buf = io.BytesIO()
    with zipfile.ZipFile(zip_buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        for i, indices in enumerate(parts):
            w = PdfWriter()
            for idx in indices:
                w.add_page(reader.pages[idx])
            pdf_buf = io.BytesIO()
            w.write(pdf_buf)
            zf.writestr(f'part_{i+1}_pages_{indices[0]+1}-{indices[-1]+1}.pdf',
                        pdf_buf.getvalue())
    zip_buf.seek(0)
    return send_file(zip_buf, mimetype='application/zip',
                     as_attachment=True, download_name='split.zip')


def _parse_split_ranges(s, total):
    parts = []
    for seg in s.split(','):
        seg = seg.strip()
        if '-' in seg:
            try:
                a, b = seg.split('-', 1)
                s1, e1 = max(1, int(a.strip())), min(total, int(b.strip()))
                if s1 <= e1:
                    parts.append(list(range(s1 - 1, e1)))
            except ValueError:
                pass
        elif seg:
            try:
                p = int(seg)
                if 1 <= p <= total:
                    parts.append([p - 1])
            except ValueError:
                pass
    return parts


# ── API: Compress ─────────────────────────────────────────── #

@app.route('/api/compress', methods=['POST'])
def api_compress():
    f = request.files.get('pdf')
    if not f:
        return jsonify({'error': 'No PDF uploaded.'}), 400

    raw = f.read()
    orig_size = len(raw)

    try:
        reader = PdfReader(io.BytesIO(raw))
        writer = PdfWriter()
        for page in reader.pages:
            writer.add_page(page)
        try:
            writer.compress_identical_objects(remove_identicals=True, remove_orphans=True)
        except AttributeError:
            pass
        for page in writer.pages:
            try:
                page.compress_content_streams()
            except Exception:
                pass
        out = io.BytesIO()
        writer.write(out)
    except Exception as e:
        return jsonify({'error': f'Compression failed: {e}'}), 500

    comp_size = len(out.getvalue())
    out.seek(0)
    resp = send_file(out, mimetype='application/pdf',
                     as_attachment=True, download_name='compressed.pdf')
    resp.headers['X-Original-Size']   = str(orig_size)
    resp.headers['X-Compressed-Size'] = str(comp_size)
    resp.headers['Access-Control-Expose-Headers'] = 'X-Original-Size, X-Compressed-Size'
    return resp


# ── API: Images → PDF ─────────────────────────────────────── #

@app.route('/api/img2pdf', methods=['POST'])
def api_img2pdf():
    if not HAS_PIL:
        return jsonify({'error': 'Pillow is not installed.'}), 500

    images = request.files.getlist('images')
    if not images:
        return jsonify({'error': 'No images uploaded.'}), 400

    writer = PdfWriter()
    for img_f in images:
        try:
            img = Image.open(img_f).convert('RGB')
            buf = io.BytesIO()
            img.save(buf, format='PDF')
            buf.seek(0)
            writer.add_page(PdfReader(buf).pages[0])
        except Exception as e:
            return jsonify({'error': f'Could not process {img_f.filename}: {e}'}), 400

    out = io.BytesIO()
    writer.write(out)
    out.seek(0)
    return send_file(out, mimetype='application/pdf',
                     as_attachment=True, download_name='images.pdf')


# ── API: Watermark ────────────────────────────────────────── #

@app.route('/api/watermark', methods=['POST'])
def api_watermark():
    if not HAS_REPORTLAB:
        return jsonify({'error': 'ReportLab is not installed.'}), 500

    f = request.files.get('pdf')
    if not f:
        return jsonify({'error': 'No PDF uploaded.'}), 400

    text     = request.form.get('text', 'CONFIDENTIAL')
    opacity  = float(request.form.get('opacity', 0.3))
    rotation = float(request.form.get('rotation', 45))
    fontsize = float(request.form.get('fontsize', 48))
    position = request.form.get('position', 'center')

    try:
        reader = PdfReader(io.BytesIO(f.read()))
    except Exception as e:
        return jsonify({'error': f'Could not read PDF: {e}'}), 400

    writer = PdfWriter()
    for page in reader.pages:
        w = float(page.mediabox.width)
        h = float(page.mediabox.height)

        wm_buf = io.BytesIO()
        c = rl_canvas.Canvas(wm_buf, pagesize=(w, h))
        c.setFillColor(Color(0, 0, 0, alpha=opacity))
        c.setFont('Helvetica-Bold', fontsize)
        tw = c.stringWidth(text, 'Helvetica-Bold', fontsize)

        pos_map = {
            'center':      (w / 2 - tw / 2, h / 2),
            'topleft':     (fontsize, h - fontsize * 2),
            'topright':    (w - tw - fontsize, h - fontsize * 2),
            'bottomleft':  (fontsize, fontsize),
            'bottomright': (w - tw - fontsize, fontsize),
        }
        tx, ty = pos_map.get(position, (w / 2 - tw / 2, h / 2))

        c.saveState()
        c.translate(tx + tw / 2, ty)
        c.rotate(rotation)
        c.drawString(-tw / 2, 0, text)
        c.restoreState()
        c.save()
        wm_buf.seek(0)

        writer.add_page(page)
        writer.pages[-1].merge_page(PdfReader(wm_buf).pages[0])

    out = io.BytesIO()
    writer.write(out)
    out.seek(0)
    return send_file(out, mimetype='application/pdf',
                     as_attachment=True, download_name='watermarked.pdf')


# ── API: Protect ──────────────────────────────────────────── #

@app.route('/api/protect', methods=['POST'])
def api_protect():
    f = request.files.get('pdf')
    if not f:
        return jsonify({'error': 'No PDF uploaded.'}), 400

    password = request.form.get('password', '').strip()
    if not password:
        return jsonify({'error': 'Password is required.'}), 400

    try:
        reader = PdfReader(io.BytesIO(f.read()))
        writer = PdfWriter()
        for page in reader.pages:
            writer.add_page(page)
        writer.encrypt(password)
    except Exception as e:
        return jsonify({'error': f'Failed: {e}'}), 500

    out = io.BytesIO()
    writer.write(out)
    out.seek(0)
    return send_file(out, mimetype='application/pdf',
                     as_attachment=True, download_name='protected.pdf')


# ── API: Metadata ─────────────────────────────────────────── #

@app.route('/api/metadata/info', methods=['POST'])
def api_metadata_info():
    f = request.files.get('pdf')
    if not f:
        return jsonify({'error': 'No PDF uploaded.'}), 400
    try:
        reader = PdfReader(io.BytesIO(f.read()))
    except Exception as e:
        return jsonify({'error': f'Could not read PDF: {e}'}), 400

    m = reader.metadata or {}
    return jsonify({
        'title':    m.get('/Title', '') or '',
        'author':   m.get('/Author', '') or '',
        'subject':  m.get('/Subject', '') or '',
        'keywords': m.get('/Keywords', '') or '',
        'creator':  m.get('/Creator', '') or '',
        'pages':    len(reader.pages),
    })


@app.route('/api/metadata/save', methods=['POST'])
def api_metadata_save():
    f = request.files.get('pdf')
    if not f:
        return jsonify({'error': 'No PDF uploaded.'}), 400
    try:
        reader = PdfReader(io.BytesIO(f.read()))
        writer = PdfWriter()
        for page in reader.pages:
            writer.add_page(page)
        writer.add_metadata({
            '/Title':    request.form.get('title', ''),
            '/Author':   request.form.get('author', ''),
            '/Subject':  request.form.get('subject', ''),
            '/Keywords': request.form.get('keywords', ''),
        })
    except Exception as e:
        return jsonify({'error': f'Failed: {e}'}), 500

    out = io.BytesIO()
    writer.write(out)
    out.seek(0)
    return send_file(out, mimetype='application/pdf',
                     as_attachment=True, download_name='updated.pdf')


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 5000)))