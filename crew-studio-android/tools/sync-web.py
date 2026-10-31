"""Copy the Crew Studio page into the app (run after every web change, then commit).
Usage: python tools/sync-web.py path/to/CrewStudio.html"""
import re, sys, pathlib
src = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else 'CrewStudio.html').read_text(encoding='utf-8')
# offline app: no web fonts (Android's own condensed font is used), nothing fetched from the internet at start-up
src = re.sub(r'<link rel="preconnect"[^>]*>\s*', '', src)
src = re.sub(r'<link[^>]*fonts\.googleapis[^>]*>\s*', '', src)
src = re.sub(r'<link[^>]*fonts\.gstatic[^>]*>\s*', '', src)
out = pathlib.Path(__file__).resolve().parent.parent / 'app/src/main/assets/www/index.html'
out.write_text(src, encoding='utf-8')
print('wrote', out, len(src), 'bytes')
