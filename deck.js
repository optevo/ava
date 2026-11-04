/* AVA deck: writes a PowerPoint (.pptx) on the OutSystems brand template when it is present, and on a plain unbranded base when it is not (the public build). No DOM, no libraries, works offline.
 * The template (AVABrandTemplate, brand.js, left out of the public build) is a slimmed copy of the OutSystems brand presentation with its master, theme, embedded fonts and
 * three layouts. Slides are added to it as XML, so everything uses the brand's own theme and fonts (Inter Tight). The file opens in PowerPoint and Keynote, and in
 * Google Slides (upload to Drive, then open with Google Slides: the template was made in Google Slides, so it converts cleanly).
 *
 * build(spec) -> Uint8Array. spec = { slides: [slide], images: { name: Uint8Array (png) } }
 *   slide = { layout: 'cover' | 'content' | 'section', title, subtitle, footer1, footer2, items: [item] }
 *   item  = { t:'text', x, y, w, h, paras, fill, line, round, anchor, inset }
 *         | { t:'img', x, y, w, h, name, alt }
 *         | { t:'table', x, y, colW: [in], rowH, rows: [[cell]] }       cell = { t, bold, align, fill, color, size }
 *   para  = { runs: [{t, bold, color, size}] } or { t, ... }, with size (pt), bold, color, align, bullet, after (pt)
 * Positions and sizes are in inches on a 13.333 x 7.5 slide.
 */
(function (root) {
  'use strict';
  var ST = root.AVAStore || (typeof require !== 'undefined' ? require('./store.js') : null);

  var COL = { text: '181A1F', muted: '5B5F66', faint: '8A8D93', panel: 'F5F5ED', line: 'D9D9D2', os: '234BFF', alt: '9A9DA6', red: 'FF2400', cyan: '00A3BF', amber: 'E58A00', white: 'FFFFFF' };
  var FONT = 'Inter Tight';
  var EMU = 914400;
  var NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
  var LAYOUT = { cover: 'slideLayout1.xml', section: 'slideLayout13.xml', content: 'slideLayout25.xml' };

  function emu(inches) { return Math.round(inches * EMU); }
  function esc(s) { return String(s === undefined || s === null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ''); }

  function b64decode(s) {
    var tbl = {}, chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/', i;
    for (i = 0; i < 64; i++) tbl[chars.charAt(i)] = i;
    s = s.replace(/[^A-Za-z0-9+/]/g, '');
    var n = Math.floor(s.length * 3 / 4), out = new Uint8Array(n), o = 0, a, b, c, d;
    for (i = 0; i + 3 < s.length + 3 && o < n; i += 4) {
      a = tbl[s.charAt(i)]; b = tbl[s.charAt(i + 1)]; c = tbl[s.charAt(i + 2)]; d = tbl[s.charAt(i + 3)];
      out[o++] = a << 2 | b >> 4; if (o < n) out[o++] = (b & 15) << 4 | c >> 2; if (o < n) out[o++] = (c & 3) << 6 | d;
    }
    return out;
  }

  /* ---- text ---- */
  function fillXml(c) { return c ? '<a:solidFill><a:srgbClr val="' + c + '"/></a:solidFill>' : ''; }
  function rPr(o) {
    return '<a:rPr lang="en-US" sz="' + Math.round((o.size || 14) * 100) + '"' + (o.bold ? ' b="1"' : '') + ' dirty="0">' + fillXml(o.color || COL.text) +
      '<a:latin typeface="' + (o.font || FONT) + '"/><a:ea typeface="' + (o.font || FONT) + '"/><a:cs typeface="' + (o.font || FONT) + '"/></a:rPr>';
  }
  function para(p) {
    var runs = p.runs || [{ t: p.t }], algn = p.align === 'r' ? 'r' : p.align === 'c' ? 'ctr' : 'l';
    var ppr = '<a:pPr algn="' + algn + '"' + (p.bullet ? ' marL="228600" indent="-228600"' : ' marL="0" indent="0"') + '>' +
      '<a:lnSpc><a:spcPct val="' + (p.line || 100000) + '"/></a:lnSpc><a:spcBef><a:spcPts val="0"/></a:spcBef><a:spcAft><a:spcPts val="' + Math.round((p.after || 0) * 100) + '"/></a:spcAft>' +
      (p.bullet ? '<a:buClr><a:srgbClr val="' + COL.muted + '"/></a:buClr><a:buFont typeface="Arial"/><a:buChar char="•"/>' : '<a:buNone/>') + '</a:pPr>';
    var rs = runs.map(function (r) {
      var o = { size: r.size || p.size, bold: r.bold !== undefined ? r.bold : p.bold, color: r.color || p.color, font: r.font || p.font };
      return '<a:r>' + rPr(o) + '<a:t>' + esc(r.t) + '</a:t></a:r>';
    }).join('');
    return '<a:p>' + ppr + rs + '</a:p>';
  }
  function paras(list) { return (list && list.length ? list : [{ t: '' }]).map(para).join(''); }

  /* ---- shapes ---- */
  var nextId;
  function xfrm(x, y, w, h) { return '<a:xfrm><a:off x="' + emu(x) + '" y="' + emu(y) + '"/><a:ext cx="' + emu(w) + '" cy="' + emu(h) + '"/></a:xfrm>'; }
  function textShape(it) {
    var id = nextId++, inset = it.inset === undefined ? 0.05 : it.inset, geom = it.round ? '<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val ' + (it.round === true ? 6000 : it.round) + '"/></a:avLst></a:prstGeom>' : '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>';
    return '<p:sp><p:nvSpPr><p:cNvPr id="' + id + '" name="Text ' + id + '"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr>' + xfrm(it.x, it.y, it.w, it.h) + geom +
      (it.fill ? fillXml(it.fill) : '<a:noFill/>') + (it.line ? '<a:ln w="9525">' + fillXml(it.line) + '</a:ln>' : '<a:ln><a:noFill/></a:ln>') + '</p:spPr>' +
      '<p:txBody><a:bodyPr wrap="square" lIns="' + emu(inset) + '" tIns="' + emu(inset) + '" rIns="' + emu(inset) + '" bIns="' + emu(inset) + '" rtlCol="0" anchor="' + (it.anchor || 't') + '"><a:noAutofit/></a:bodyPr><a:lstStyle/>' + paras(it.paras) + '</p:txBody></p:sp>';
  }
  function picShape(it, rId) {
    var id = nextId++;
    return '<p:pic><p:nvPicPr><p:cNvPr id="' + id + '" name="Picture ' + id + '" descr="' + esc(it.alt || '') + '"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>' +
      '<p:blipFill><a:blip r:embed="' + rId + '"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>' + xfrm(it.x, it.y, it.w, it.h) + '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>';
  }
  function tableShape(it) {
    var id = nextId++, rowH = it.rowH || 0.32, total = 0, grid = '', h = rowH * it.rows.length;
    it.colW.forEach(function (w) { total += w; grid += '<a:gridCol w="' + emu(w) + '"/>'; });
    var border = function (side, color) { return '<a:' + side + ' w="' + (color ? 9525 : 0) + '" cap="flat" cmpd="sng" algn="ctr">' + (color ? fillXml(color) : '<a:noFill/>') + '</a:' + side + '>'; };
    var rows = it.rows.map(function (row, ri) {
      return '<a:tr h="' + emu(it.rowHs && it.rowHs[ri] ? it.rowHs[ri] : rowH) + '">' + row.map(function (c, ci) {
        c = typeof c === 'object' && c !== null ? c : { t: c };
        var p = { t: c.t, size: c.size || it.size || 11, bold: c.bold, color: c.color, align: c.align || (ci === 0 ? 'l' : 'r') };
        return '<a:tc' + (c.span ? ' gridSpan="' + c.span + '"' : '') + '><a:txBody><a:bodyPr/><a:lstStyle/>' + para(p) + '</a:txBody><a:tcPr marL="' + emu(0.08) + '" marR="' + emu(0.08) + '" marT="' + emu(0.03) + '" marB="' + emu(0.03) + '" anchor="ctr">' +
          border('lnL') + border('lnR') + border('lnT') + border('lnB', c.rule === false ? null : COL.line) + (c.fill ? fillXml(c.fill) : '<a:noFill/>') + '</a:tcPr></a:tc>' +
          (c.span ? new Array(c.span).join('<a:tc hMerge="1"><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="en-US"/></a:p></a:txBody><a:tcPr/></a:tc>') : '');
      }).join('') + '</a:tr>';
    }).join('');
    return '<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="' + id + '" name="Table ' + id + '"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr>' +
      '<p:xfrm><a:off x="' + emu(it.x) + '" y="' + emu(it.y) + '"/><a:ext cx="' + emu(total) + '" cy="' + emu(h) + '"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr firstRow="1"/><a:tblGrid>' + grid + '</a:tblGrid>' + rows + '</a:tbl></a:graphicData></a:graphic></p:graphicFrame>';
  }
  function placeholder(kind, idx, text, size, extra) {
    var id = nextId++, ph = kind === 'title' ? '<p:ph type="title"/>' : kind === 'subTitle' ? '<p:ph type="subTitle" idx="1"/>' : kind === 'sldNum' ? '<p:ph type="sldNum" sz="quarter" idx="12"/>' : '<p:ph type="body" idx="' + idx + '"/>';
    var body = kind === 'sldNum'
      ? '<a:p><a:fld id="{B6F15528-21DE-4FAA-801E-634DDDAF4B2B}" type="slidenum"><a:rPr lang="en-US"/><a:t>‹#›</a:t></a:fld><a:endParaRPr lang="en-US"/></a:p>'
      : (text === '' || text === undefined ? '<a:p><a:endParaRPr lang="en-US"/></a:p>' : String(text).split('\n').map(function (ln) {
        return '<a:p><a:r><a:rPr lang="en-US"' + (size ? ' sz="' + Math.round(size * 100) + '"' : '') + ' dirty="0"/><a:t>' + esc(ln) + '</a:t></a:r></a:p>';
      }).join(''));
    return '<p:sp><p:nvSpPr><p:cNvPr id="' + id + '" name="' + kind + ' ' + id + '"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr>' + ph + '</p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>' + body + '</p:txBody></p:sp>';
  }

  function slideXml(s, imgRel) {
    nextId = 2;
    var shapes = '';
    /* The template's title style is 80 pt (its big cover size); its own example slides set 36 pt for normal slide titles, so slides must set a size. */
    shapes += placeholder('title', 0, s.title, s.titleSize || (s.layout === 'cover' ? 40 : 36));
    if (s.layout === 'cover') shapes += placeholder('subTitle', 1, s.subtitle || '', s.subtitleSize || 20);
    if (s.layout === 'content') {
      shapes += placeholder('body', 1, s.footer1 || '');
      shapes += placeholder('body', 2, s.footer2 || '');
      shapes += placeholder('sldNum', 12, '');
    }
    (s.items || []).forEach(function (it) {
      if (it.t === 'text') shapes += textShape(it);
      else if (it.t === 'img') shapes += picShape(it, imgRel[it.name]);
      else if (it.t === 'table') shapes += tableShape(it);
    });
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld ' + NS + '><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>' +
      shapes + '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>';
  }

  /* ---- a plain, unbranded base presentation (used when no brand template is supplied, as in the public build) ---- */
  var PNS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
  var XMLH = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  var GRP = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
  function phSp(id, name, ph, x, y, w, h, bodyPr, lst, text) {
    return '<p:sp><p:nvSpPr><p:cNvPr id="' + id + '" name="' + name + '"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr>' + ph + '</p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="' + emu(x) + '" y="' + emu(y) + '"/><a:ext cx="' + emu(w) + '" cy="' + emu(h) + '"/></a:xfrm></p:spPr>' +
      '<p:txBody>' + bodyPr + '<a:lstStyle>' + (lst || '') + '</a:lstStyle><a:p>' + (text ? '<a:r><a:rPr lang="en-US"/><a:t>' + text + '</a:t></a:r>' : '<a:endParaRPr lang="en-US"/>') + '</a:p></p:txBody></p:sp>';
  }
  function plainLayout(name, shapes) {
    return XMLH + '<p:sldLayout ' + PNS + ' preserve="1"><p:cSld name="' + name + '"><p:spTree>' + GRP + shapes + '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>';
  }
  function plainTemplate() {
    var rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/', rels = function (items) { return XMLH + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + items + '</Relationships>'; };
    var theme = XMLH + '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="AVA"><a:themeElements><a:clrScheme name="AVA"><a:dk1><a:srgbClr val="181A1F"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="5B5F66"/></a:dk2><a:lt2><a:srgbClr val="F5F5ED"/></a:lt2>' +
      '<a:accent1><a:srgbClr val="234BFF"/></a:accent1><a:accent2><a:srgbClr val="9A9DA6"/></a:accent2><a:accent3><a:srgbClr val="00A3BF"/></a:accent3><a:accent4><a:srgbClr val="E58A00"/></a:accent4><a:accent5><a:srgbClr val="FF2400"/></a:accent5><a:accent6><a:srgbClr val="5B5F66"/></a:accent6><a:hlink><a:srgbClr val="234BFF"/></a:hlink><a:folHlink><a:srgbClr val="5B5F66"/></a:folHlink></a:clrScheme>' +
      '<a:fontScheme name="AVA"><a:majorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>' +
      '<a:fmtScheme name="AVA"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>' +
      '<a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="28575"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>' +
      '<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>' +
      '<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>';
    var bp = '<a:bodyPr/>', title = '<p:ph type="title"/>', sub = '<p:ph type="subTitle" idx="1"/>', b1 = '<p:ph type="body" idx="1"/>', b2 = '<p:ph type="body" idx="2"/>', num = '<p:ph type="sldNum" sz="quarter" idx="12"/>';
    var small = '<a:lvl1pPr marL="0" indent="0"><a:buNone/><a:defRPr sz="1000"><a:solidFill><a:schemeClr val="tx2"/></a:solidFill></a:defRPr></a:lvl1pPr>';
    var master = XMLH + '<p:sldMaster ' + PNS + '><p:cSld><p:bg><p:bgPr><a:solidFill><a:schemeClr val="bg1"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree>' + GRP +
      phSp(2, 'Title', title, 0.56, 0.35, 12.2, 1.0, '<a:bodyPr anchor="ctr"/>', '', 'Click to edit the title') + phSp(3, 'Body', '<p:ph type="body" idx="1"/>', 0.56, 1.5, 12.2, 5.2, bp, '', 'Click to edit the text') +
      phSp(4, 'Slide number', num, 12.0, 7.05, 0.8, 0.3, bp, '', '') + '</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>' +
      '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/><p:sldLayoutId id="2147483650" r:id="rId2"/><p:sldLayoutId id="2147483651" r:id="rId3"/></p:sldLayoutIdLst>' +
      '<p:txStyles><p:titleStyle><a:lvl1pPr algn="l"><a:defRPr sz="3600" b="1"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mj-lt"/></a:defRPr></a:lvl1pPr></p:titleStyle>' +
      '<p:bodyStyle><a:lvl1pPr marL="0" indent="0"><a:buNone/><a:defRPr sz="1800"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/></a:defRPr></a:lvl1pPr></p:bodyStyle><p:otherStyle><a:defPPr><a:defRPr lang="en-US"/></a:defPPr></p:otherStyle></p:txStyles></p:sldMaster>';
    var layRels = rels('<Relationship Id="rId1" Type="' + rel + 'slideMaster" Target="../slideMasters/slideMaster1.xml"/>');
    var files = {
      '[Content_Types].xml': XMLH + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>' +
        '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>' +
        ['1', '13', '25'].map(function (n) { return '<Override PartName="/ppt/slideLayouts/slideLayout' + n + '.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>'; }).join('') +
        '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/></Types>',
      '_rels/.rels': rels('<Relationship Id="rId1" Type="' + rel + 'officeDocument" Target="ppt/presentation.xml"/>'),
      'ppt/presentation.xml': XMLH + '<p:presentation ' + PNS + '><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst/><p:sldSz cx="12192000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/><p:defaultTextStyle><a:defPPr><a:defRPr lang="en-US"/></a:defPPr></p:defaultTextStyle></p:presentation>',
      'ppt/_rels/presentation.xml.rels': rels('<Relationship Id="rId1" Type="' + rel + 'slideMaster" Target="slideMasters/slideMaster1.xml"/><Relationship Id="rId2" Type="' + rel + 'theme" Target="theme/theme1.xml"/>'),
      'ppt/theme/theme1.xml': theme, 'ppt/slideMasters/slideMaster1.xml': master,
      'ppt/slideMasters/_rels/slideMaster1.xml.rels': rels('<Relationship Id="rId1" Type="' + rel + 'slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="' + rel + 'slideLayout" Target="../slideLayouts/slideLayout13.xml"/><Relationship Id="rId3" Type="' + rel + 'slideLayout" Target="../slideLayouts/slideLayout25.xml"/><Relationship Id="rId4" Type="' + rel + 'theme" Target="../theme/theme1.xml"/>'),
      'ppt/slideLayouts/slideLayout1.xml': plainLayout('Cover', phSp(2, 'Title', title, 0.8, 2.3, 11.7, 1.6, '<a:bodyPr anchor="b"/>', '<a:lvl1pPr><a:defRPr sz="4000" b="1"/></a:lvl1pPr>', 'Click to edit the title') + phSp(3, 'Subtitle', sub, 0.8, 4.1, 11.7, 1.0, bp, '<a:lvl1pPr marL="0" indent="0"><a:buNone/><a:defRPr sz="2000"/></a:lvl1pPr>', 'Click to edit the subtitle')),
      'ppt/slideLayouts/slideLayout13.xml': plainLayout('Section', phSp(2, 'Title', title, 0.8, 2.8, 11.7, 1.6, '<a:bodyPr anchor="ctr"/>', '<a:lvl1pPr><a:defRPr sz="4000" b="1"/></a:lvl1pPr>', 'Click to edit the title')),
      'ppt/slideLayouts/slideLayout25.xml': plainLayout('Title and footer', phSp(2, 'Title', title, 0.56, 0.35, 12.2, 1.0, '<a:bodyPr anchor="ctr"/>', '', 'Click to edit the title') + phSp(3, 'Footer left', b1, 0.56, 7.05, 6.0, 0.3, bp, small, '') + phSp(4, 'Footer right', b2, 6.7, 7.05, 5.2, 0.3, bp, small, '') + phSp(5, 'Slide number', num, 12.0, 7.05, 0.8, 0.3, bp, '', ''))
    };
    ['slideLayout1', 'slideLayout13', 'slideLayout25'].forEach(function (n) { files['ppt/slideLayouts/_rels/' + n + '.xml.rels'] = layRels; });
    var list = Object.keys(files).map(function (n) { return { name: n, data: ST.utf8(files[n]) }; });
    return ST.zipStore(list);
  }

  /* templateB64: the brand template (base64); omit to use the one loaded as AVABrandTemplate; pass false, or have none loaded, for the plain unbranded base. */
  function build(spec, templateB64) {
    var src = templateB64 === false ? null : (templateB64 || root.AVABrandTemplate || null);
    FONT = src ? 'Inter Tight' : 'Arial';   // the brand font comes with the template; without it the plain deck uses a font every machine has
    var parts = ST.zipReadSync(src ? b64decode(src) : plainTemplate()), files = [], names = Object.keys(parts), i, k;
    var ct = ST.fromUtf8(parts['[Content_Types].xml']), prs = ST.fromUtf8(parts['ppt/presentation.xml']), rels = ST.fromUtf8(parts['ppt/_rels/presentation.xml.rels']);
    var overrides = '', sldIds = '', relsAdd = '', media = {};
    (spec.slides || []).forEach(function (s, n) {
      var no = n + 1, srel = '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/' + LAYOUT[s.layout || 'content'] + '"/>', imgRel = {}, r = 2;
      (s.items || []).forEach(function (it) {
        if (it.t === 'img' && !imgRel[it.name]) {
          imgRel[it.name] = 'rId' + r++; media[it.name] = true;
          srel += '<Relationship Id="' + imgRel[it.name] + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/ava_' + it.name + '.png"/>';
        }
      });
      parts['ppt/slides/slide' + no + '.xml'] = ST.utf8(slideXml(s, imgRel));
      parts['ppt/slides/_rels/slide' + no + '.xml.rels'] = ST.utf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + srel + '</Relationships>');
      overrides += '<Override PartName="/ppt/slides/slide' + no + '.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>';
      sldIds += '<p:sldId id="' + (255 + no) + '" r:id="rIdAvaS' + no + '"/>';
      relsAdd += '<Relationship Id="rIdAvaS' + no + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide' + no + '.xml"/>';
    });
    Object.keys(media).forEach(function (m) { parts['ppt/media/ava_' + m + '.png'] = (spec.images || {})[m] || new Uint8Array(0); });
    ct = ct.replace('</Types>', overrides + '</Types>');
    prs = prs.replace(/<p:sldIdLst\s*\/>/, '<p:sldIdLst>' + sldIds + '</p:sldIdLst>');
    rels = rels.replace('</Relationships>', relsAdd + '</Relationships>');
    parts['[Content_Types].xml'] = ST.utf8(ct); parts['ppt/presentation.xml'] = ST.utf8(prs); parts['ppt/_rels/presentation.xml.rels'] = ST.utf8(rels);
    for (k in parts) if (Object.prototype.hasOwnProperty.call(parts, k)) files.push({ name: k, data: parts[k] });
    files.sort(function (a, b) { return (a.name === '[Content_Types].xml' ? 0 : 1) - (b.name === '[Content_Types].xml' ? 0 : 1); });
    return ST.zipStore(files);
  }

  var api = { build: build, COL: COL, b64decode: b64decode, esc: esc };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.AVADeck = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
