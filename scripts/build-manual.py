"""Build the downloadable manual from docs/system-manual.md.

Requires Python 3.10+, reportlab; --font accepts a CJK TrueType font.
Generated HTML and PDF share the same Markdown source. No network access.
"""
import argparse
import hashlib
import html
import json
import re
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (BaseDocTemplate, CondPageBreak, Frame, PageTemplate,
                               Paragraph, Spacer, PageBreak, Table, TableStyle)
from reportlab.platypus.tableofcontents import TableOfContents

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/docs'
SOURCE = ROOT / 'docs/system-manual.md'
TITLE = 'HEXAMOTION 完整系統手冊'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--font', default='C:/Windows/Fonts/msjh.ttc')
parser.add_argument('--bold-font', default='C:/Windows/Fonts/msjhbd.ttc')
args = parser.parse_args()
pdfmetrics.registerFont(TTFont('CJK', args.font, subfontIndex=0))
pdfmetrics.registerFont(TTFont('CJKB', args.bold_font if Path(args.bold_font).exists() else args.font, subfontIndex=0))
pdfmetrics.registerFontFamily('CJK', normal='CJK', bold='CJKB', italic='CJK', boldItalic='CJKB')
OUT.mkdir(parents=True, exist_ok=True)
text = SOURCE.read_text(encoding='utf-8')
font_cmap = pdfmetrics.getFont('CJK').face.charToGlyph
# Plain, searchable alternatives for math glyphs absent from the CJK font.
math_fallback = {'ᵀ':'^T','ᵢ':'_i','ᵦ':'_b','⁵':'^5','⁻':'-','₀':'_0','₁':'_1','−':'-','≤':'<='}
meta = json.loads((ROOT / 'docs/manual-meta.json').read_text(encoding='utf-8'))

def inline(s, pdf=False):
    if pdf:
        s = ''.join(math_fallback.get(c,c) if ord(c) not in font_cmap else c for c in s)
    s = html.escape(s, quote=False)
    s = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', s)
    s = re.sub(r'`([^`]+)`', r'<font color="#245c74">\1</font>' if pdf else r'<code>\1</code>', s)
    s = re.sub(r'\[([^\]]+)\]\((https?://[^\s)]+)\)', r'<a href="\2" color="#176a75">\1</a>' if pdf else r'<a href="\2">\1</a>', s)
    if not pdf:
        s = re.sub(r'\[([^\]]+)\]\((/(?!/)[^\s)"<>]*)\)', r'<a href="\2">\1</a>', s)
    return s

def blocks(md):
    lines = md.splitlines(); i = 0
    while i < len(lines):
        line = lines[i].strip()
        if not line: i += 1; continue
        if line.startswith('```'):
            i += 1; rows=[]
            while i < len(lines) and not lines[i].startswith('```'):
                rows.append(lines[i]); i += 1
            yield 'code', '\n'.join(rows); i += 1; continue
        if line.startswith('|'):
            rows=[]
            while i < len(lines) and lines[i].strip().startswith('|'):
                cells=[x.strip() for x in lines[i].strip().strip('|').split('|')]
                if not all(re.fullmatch(r'[:\- ]+', c) for c in cells): rows.append(cells)
                i += 1
            yield 'table', rows; continue
        m=re.match(r'^(#{1,4}) (.+)', line)
        if m: yield 'h'+str(len(m[1])), m[2]; i += 1; continue
        m=re.match(r'^(?:- |\d+\. )(.+)', line)
        if m: yield 'item', line; i += 1; continue
        rows=[line]; i += 1
        while i<len(lines) and lines[i].strip() and not re.match(r'^(#|\||```|- |\d+\. )', lines[i]):
            rows.append(lines[i].strip()); i += 1
        yield 'p', ' '.join(rows)

parsed=list(blocks(text))
styles={
 'h1': ParagraphStyle('title',fontName='CJKB',fontSize=29,leading=43,spaceAfter=22,wordWrap='CJK',textColor=colors.HexColor('#152e43')),
 'h2': ParagraphStyle('h2',fontName='CJKB',fontSize=19,leading=29,spaceBefore=18,spaceAfter=12,keepWithNext=True,wordWrap='CJK',textColor=colors.HexColor('#22272a')),
 'h3': ParagraphStyle('h3',fontName='CJKB',fontSize=13,leading=21,spaceBefore=14,spaceAfter=7,keepWithNext=True,wordWrap='CJK',textColor=colors.HexColor('#a44624')),
 'h4': ParagraphStyle('h4',fontName='CJKB',fontSize=11,leading=18,spaceBefore=10,spaceAfter=6,keepWithNext=True,wordWrap='CJK'),
 'p': ParagraphStyle('body',fontName='CJK',fontSize=10.2,leading=17.7,spaceAfter=9,wordWrap='CJK',textColor=colors.HexColor('#263847'),splitLongWords=True),
 'item': ParagraphStyle('item',fontName='CJK',fontSize=10.2,leading=17.7,spaceAfter=6,leftIndent=10,firstLineIndent=-5,wordWrap='CJK'),
 'code': ParagraphStyle('code',fontName='CJK',fontSize=8.6,leading=14,spaceAfter=4,wordWrap='CJK',backColor=colors.HexColor('#eef4f6'),borderPadding=6,textColor=colors.HexColor('#21546a')),
 'cell': ParagraphStyle('cell',fontName='CJK',fontSize=9,leading=14.5,wordWrap='CJK'),
 'th': ParagraphStyle('th',fontName='CJKB',fontSize=9,leading=14.5,wordWrap='CJK',textColor=colors.white),
}
class ManualDoc(BaseDocTemplate):
    def __init__(self, filename):
        super().__init__(filename,pagesize=A4,leftMargin=48,rightMargin=48,topMargin=49,bottomMargin=48,title=TITLE,author='HEXAMOTION',allowSplitting=True)
        self.addPageTemplates(PageTemplate(id='manual',frames=[Frame(48,48,A4[0]-96,A4[1]-97,id='body',leftPadding=0,rightPadding=0,topPadding=0,bottomPadding=0)],onPage=self.footer))
    def footer(self, c, doc):
        c.saveState(); c.setFont('CJK',8); c.setFillColor(colors.HexColor('#6b8190'))
        c.drawString(48,25,f'HEXAMOTION  /  文件 {meta["revision"]}')
        c.drawRightString(A4[0]-48,25,str(doc.page)); c.restoreState()
    def afterFlowable(self, f):
        if isinstance(f, Paragraph) and f.style.name in ('h2','h3') and hasattr(f,'_manual_anchor'):
            key=f._manual_anchor; self.canv.bookmarkPage(key)
            level=0 if f.style.name=='h2' else 1
            self.canv.addOutlineEntry(f.getPlainText(),key,level,False)
            if level == 0:
                self.notify('TOCEntry',(level,f.getPlainText(),self.page,key))

story=[]; html_body=[]; nav=[]; counter=0; toc=TableOfContents()
toc.levelStyles=[ParagraphStyle('toc0',fontName='CJKB',fontSize=10,leading=18,spaceBefore=5,wordWrap='CJK'),ParagraphStyle('toc1',fontName='CJK',fontSize=9,leading=15,leftIndent=14,wordWrap='CJK')]
first_section=True
for kind, data in parsed:
    if kind.startswith('h'):
        counter += 1; anchor=f'section-{counter}'
        if kind=='h2' and first_section:
            story += [Spacer(1,25),Paragraph('閱讀導引',styles['h3']),Paragraph('先用第 1 至 8 章熟悉系統與操作，再依需求閱讀工程、演算法及維護章節。PDF 目錄及書籤可直接跳轉；網頁版支援瀏覽器搜尋及列印。',styles['p']),PageBreak(),Paragraph('目錄',styles['h2']),toc,PageBreak()]
            first_section=False
        heading = 'HEXAMOTION<br/>完整系統手冊' if kind == 'h1' else inline(data,True)
        p=Paragraph(heading,styles[kind]); p._manual_anchor=anchor; story.append(p)
        html_body.append(f'<{kind} id="{anchor}">{inline(data)}</{kind}>')
        if kind=='h2': nav.append(f'<a href="#{anchor}">{html.escape(data)}</a>')
    elif kind=='table':
        n=max(map(len,data)); widths=[(A4[0]-96)/n]*n
        if n==2: widths=[(A4[0]-96)*.32,(A4[0]-96)*.68]
        rows=[[Paragraph(inline(c,True),styles['th' if i==0 else 'cell']) for c in row+['']*(n-len(row))] for i,row in enumerate(data)]
        table=Table(rows,colWidths=widths,repeatRows=1,hAlign='LEFT')
        table_style=TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#353b3d')),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.HexColor('#f0f5f7'),colors.white]),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),8),('RIGHTPADDING',(0,0),(-1,-1),8),('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7),('LINEBELOW',(0,0),(-1,-1),.4,colors.HexColor('#d4e0e5'))])
        table.setStyle(table_style)
        # Keep section headings with the beginning of a table. Keeping the
        # entire table together would postpone a multi-page table as a unit.
        preceding_headings=[]
        while story and isinstance(story[-1], Paragraph) and hasattr(story[-1], '_manual_anchor'):
            preceding_headings.insert(0, story.pop())
        if preceding_headings:
            content_width=sum(widths)
            header_and_first=Table(rows[:2], colWidths=widths, style=table_style)
            needed=header_and_first.wrap(content_width, A4[1])[1]
            for preceding in preceding_headings:
                preceding.keepWithNext=0
                needed+=preceding.wrap(content_width,A4[1])[1]+preceding.getSpaceBefore()+preceding.getSpaceAfter()
            story.extend([CondPageBreak(needed), *preceding_headings])
        story += [table,Spacer(1,12)]
        html_body.append('<div class="table-wrap"><table>'+''.join('<tr>'+''.join(f'<{"th" if i==0 else "td"}>{inline(c)}</{"th" if i==0 else "td"}>' for c in row)+'</tr>' for i,row in enumerate(data))+'</table></div>')
    elif kind=='code':
        for line in data.splitlines(): story.append(Paragraph(html.escape(line or ' ').replace(' ','&#160;'),styles['code']))
        story.append(Spacer(1,8)); html_body.append('<pre><code>'+html.escape(data)+'</code></pre>')
    else:
        story.append(Paragraph(inline(data,True),styles[kind]))
        html_body.append(f'<p class="{kind}">{inline(data)}</p>')
pdf=OUT/'stewart-playground-manual.pdf'
ManualDoc(str(pdf)).multiBuild(story)
css='''*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:#f4f7fa;color:#233746;font:17px/1.85 system-ui,"Microsoft JhengHei",sans-serif}header{background:#202425;color:white;padding:18px 5%;display:flex;gap:20px;align-items:center;flex-wrap:wrap}header a{color:#ffc3a5}aside{position:fixed;top:95px;bottom:20px;width:255px;padding:18px 25px;overflow:auto}aside a{display:block;font-size:14px;padding:5px 0}a{color:#176b7b;text-decoration:none}a:hover{text-decoration:underline}main{max-width:1000px;margin:38px 35px 80px 290px;padding:45px 55px;background:white;border-radius:14px;box-shadow:0 8px 35px #1c485810}h1{font-size:36px;line-height:1.45;color:#153c51}h2{font-size:27px;border-top:1px solid #dce7ec;padding-top:36px;margin-top:55px;scroll-margin-top:25px}h3{font-size:21px;color:#9b4322;margin-top:32px}h4{font-size:18px}p{margin:12px 0}.item{padding-left:16px}code{font-size:.88em;color:#25637d;overflow-wrap:anywhere}pre{white-space:pre-wrap;background:#eef4f7;padding:18px;border-radius:6px;overflow-wrap:anywhere}.table-wrap{overflow:auto}table{border-collapse:collapse;width:100%;font-size:15px;margin:20px 0}td,th{padding:12px;text-align:left;border:1px solid #d5e0e7;vertical-align:top}th{background:#353b3d;color:white}tr:nth-child(even){background:#f1f6f8}@media(max-width:900px){aside{position:static;width:auto;margin:15px;background:white;max-height:260px}main{margin:15px;padding:25px}h1{font-size:28px}h2{font-size:23px}}@media print{body{background:white;font-size:11pt}header,aside{display:none}main{margin:0;padding:0;box-shadow:none;max-width:none}h2{break-before:page;border:0}table,pre{break-inside:avoid}}'''
page='<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+TITLE+'</title><script type="module" src="/reference-entry.js"></script><style>'+css+'</style><header><b>HEXAMOTION / 系統手冊</b><a href="/">返回模擬器</a><a href="stewart-playground-manual.pdf" download>下載完整 PDF</a><a href="stewart-playground-manual.md" download>下載文字原稿</a></header><aside aria-label="章節目錄">'+''.join(nav)+'</aside><main>'+''.join(html_body)+'</main></html>'
(OUT/'index.html').write_text(page,encoding='utf-8')
(OUT/'stewart-playground-manual.md').write_text(text,encoding='utf-8')
paths=[]
for directory in ['app','lib','scripts','docs']:
    paths.extend(p for p in (ROOT/directory).rglob('*') if p.is_file() and p.suffix in ['.ts','.tsx','.css','.mjs','.py','.md','.json','.ps1','.cmd'])
paths += [ROOT/p for p in ['package.json','pnpm-lock.yaml','README.md','AGENTS.md','index.html','lab.html','vite.config.ts','啟動 HEXAMOTION.cmd','停止 HEXAMOTION.cmd'] if (ROOT/p).exists()]
inputs={p.relative_to(ROOT).as_posix():hashlib.sha256(p.read_bytes().replace(b'\r\n',b'\n')).hexdigest() for p in sorted(paths)}
outputs={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(OUT.iterdir()) if p.suffix in ['.pdf','.html','.md']}
(OUT/'manual-manifest.json').write_text(json.dumps({'revision':meta['revision'],'updated':meta['updated'],'inputs':inputs,'outputs':outputs},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'pdf':str(pdf),'bytes':pdf.stat().st_size,'revision':meta['revision'],'source_files':len(inputs)},ensure_ascii=False))
