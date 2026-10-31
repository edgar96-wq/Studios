"""Build the Ledger Studio page from web/ (run after every web change; the cloud build runs it too).
Writes:
  app/src/main/assets/www/index.html  — the page inside the Android app (offline: no web fonts)
  web/dist/ledger-studio.html         — the same page for the claude.ai artifact (with web fonts)
Usage: python tools/build-web.py"""
import pathlib, re

root = pathlib.Path(__file__).resolve().parent.parent
web = root / 'web'
read = lambda n: (web / n).read_text(encoding='utf-8')
# phone.js goes before app.js: app.js starts the app at its end and uses what phone.js defines
page = read('head.html') + read('body.html') + '<script>\n' + read('core.js') + '\n' + read('phone.js') + '\n' + read('app.js') + '\n</script>\n'

dist = web / 'dist'
dist.mkdir(exist_ok=True)
(dist / 'ledger-studio.html').write_text(page, encoding='utf-8')

offline = re.sub(r'<link rel="preconnect"[^>]*>\s*', '', page)
offline = re.sub(r'<link[^>]*fonts\.(googleapis|gstatic)[^>]*>\s*', '', offline)
app_page = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' \
           '<style>:root{color-scheme:light}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style></head><body>' + offline + '</body></html>'
out = root / 'app/src/main/assets/www/index.html'
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(app_page, encoding='utf-8')
print('wrote', out.relative_to(root), len(app_page), 'bytes and', (dist / 'ledger-studio.html').relative_to(root))
