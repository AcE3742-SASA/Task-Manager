"""Fetch upstream fonts and licenses; run with Python + fontTools (WOFF uses stdlib zlib).

Runtime fonts are served locally; this script is only for updating the checked-in assets.
"""
import hashlib
import base64
import io
import json
from pathlib import Path
import re
import subprocess
import zipfile

from fontTools.ttLib import TTFont

DEST = Path(__file__).resolve().parents[1] / 'public' / 'fonts'
DEST.mkdir(parents=True, exist_ok=True)
sources = {}


def fetch(url):
    if url.startswith('https://raw.githubusercontent.com/'):
        owner, repo, ref, path = url.removeprefix('https://raw.githubusercontent.com/').split('/', 3)
        api = f'https://api.github.com/repos/{owner}/{repo}/contents/{path}?ref={ref}'
        payload = json.loads(fetch(api))
        if payload.get('encoding') != 'base64':
            raise RuntimeError(f'GitHub did not return file content: {url}')
        return base64.b64decode(payload['content'])
    return subprocess.check_output(['curl', '-fsSL', '--retry', '2', '--retry-all-errors', '--connect-timeout', '10', '--max-time', '40',
        '-A', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36', url])


def save(name, data, url):
    (DEST / name).write_bytes(data)
    sources[name] = {'source': url, 'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data)}
    print(f'{name}: {len(data):,} bytes', flush=True)


line_url = 'https://seed.line.me/src/images/fonts/LINE_Seed_Sans_KR.zip'
line_zip = zipfile.ZipFile(io.BytesIO(fetch(line_url)))
ofl = fetch('https://raw.githubusercontent.com/google/fonts/main/ofl/manrope/OFL.txt').decode()
ofl = ofl[ofl.index('SIL OPEN FONT LICENSE'):]
line_ttf = next(n for n in line_zip.namelist() if n.endswith('/LINESeedKR-Rg.ttf') and not n.startswith('__'))
line_font = TTFont(io.BytesIO(line_zip.read(line_ttf)))
copyright = next(n.toUnicode() for n in line_font['name'].names if n.nameID == 0)
save('LINE-Seed-LICENSE.txt', (copyright + '\n\n' + ofl).encode(), line_url)
for weight, suffix in [('regular', 'Rg'), ('bold', 'Bd')]:
    name = next(n for n in line_zip.namelist() if n.endswith(f'/LINESeedKR-{suffix}.woff2') and not n.startswith('__'))
    save(f'line-seed-kr-{weight}.woff2', line_zip.read(name), line_url)

gmarket_url = 'https://corp.gmarket.com/fonts/GmarketSansTTF.zip'
gmarket_zip = zipfile.ZipFile(io.BytesIO(fetch(gmarket_url)))
for weight in ['Medium', 'Bold']:
    name = next(n for n in gmarket_zip.namelist() if n.lower().endswith(f'{weight.lower()}.ttf'))
    font = TTFont(io.BytesIO(gmarket_zip.read(name)))
    font.flavor = 'woff'
    data = io.BytesIO()
    font.save(data)
    save(f'gmarket-sans-{weight.lower()}.woff', data.getvalue(), gmarket_url)
# Preserve the full license supplied in the upstream font's name table.
license_text = '\n\n'.join(dict.fromkeys(n.toUnicode() for n in font['name'].names if n.nameID in (0, 13, 14)))
if 'SIL OPEN FONT LICENSE' not in license_text.upper():
    raise RuntimeError('Gmarket upstream license missing')
if 'PREAMBLE' not in license_text:
    license_text += '\n\n' + ofl
save('Gmarket-Sans-LICENSE.txt', license_text.encode(), gmarket_url)

suit_base = 'https://raw.githubusercontent.com/sun-typeface/SUIT/v2.0.5'
for weight in ['Regular', 'Medium', 'SemiBold']:
    url = f'{suit_base}/fonts/static/woff2/SUIT-{weight}.woff2'
    save(f'suit-{weight.lower()}.woff2', fetch(url), url)
save('SUIT-LICENSE.txt', fetch(f'{suit_base}/LICENSE'), f'{suit_base}/LICENSE')

for family, slug, axes in [('Space Grotesk', 'space-grotesk', '500..700'), ('Manrope', 'manrope', '400..700')]:
    css_url = f'https://fonts.googleapis.com/css2?family={family.replace(" ", "+")}:wght@{axes}&display=swap'
    css = fetch(css_url).decode()
    urls = re.findall(r'url\((https://[^)]+\.woff2)\)', css)
    if not urls:
        raise RuntimeError(f'No WOFF2 in {css_url}')
    # Last @font-face is the Latin subset; one variable file serves all requested weights.
    save(f'{slug}-latin.woff2', fetch(urls[-1]), urls[-1])
    license_url = f'https://raw.githubusercontent.com/google/fonts/main/ofl/{slug.replace("-", "")}/OFL.txt'
    save(f'{family.replace(" ", "-")}-LICENSE.txt', fetch(license_url), license_url)

(DEST / 'theme-font-sources.json').write_text(json.dumps(sources, ensure_ascii=False, indent=2) + '\n')
