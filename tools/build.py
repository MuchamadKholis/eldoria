"""Bundle Eldoria into ONE self-contained HTML file: dist/eldoria.html
Usage: python3 tools/build.py   (the result runs offline by double-clicking)"""
import os, re
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
css = lambda m: '<style>\n' + open(os.path.join(ROOT, m.group(1)), encoding='utf-8').read() + '\n</style>'
js = lambda m: '<script>/* ' + m.group(1) + ' */\n' + open(os.path.join(ROOT, m.group(1)), encoding='utf-8').read().replace('</script', '<\\/script') + '\n</script>'
out = re.sub(r'<link rel="stylesheet" href="(css/[^"]+)">', css, src)
out = re.sub(r'<script src="(js/[^"]+)"></script>', js, out)
assert 'src="js/' not in out and 'href="css/' not in out
os.makedirs(os.path.join(ROOT, 'dist'), exist_ok=True)
dest = os.path.join(ROOT, 'dist', 'eldoria.html')
open(dest, 'w', encoding='utf-8').write(out)
print('Built', dest, '(%d KB)' % (len(out.encode()) // 1024))
