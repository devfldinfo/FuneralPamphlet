/**
 * Main entry point – loops all <FP> emails and processes them
 */
function generateHymnPamphletsFromAllEmails() {
  var threads = GmailApp.search('subject:"<FP>" is:unread');
  if (threads.length === 0) {
    Logger.log("No unread emails with '<FP>' in the subject found.");
    return;
  }

  var spreadsheet = SpreadsheetApp.openById('1apy0KAiVw4C8Cr8hexmdom0xQjvh8gvMjs3U-GraS9c');
  var pamphletSheet = spreadsheet.getSheetByName('Pamphlet') || spreadsheet.insertSheet('Pamphlet');
  pamphletSheet.clear();

  var allLines = [];
  var folder = DriveApp.getRootFolder();

  threads.forEach(thread => {
    thread.getMessages().forEach(message => {
      if (!message.isUnread()) return;

      var body = message.getPlainBody().trim();
      var senderMatch = message.getFrom().match(/<(.+?)>/);
      var sender = (senderMatch ? senderMatch[1] : message.getFrom()).split('@')[0];
      var imageName = extractAndSaveImage(message, folder);

      message.markRead();

      var { aname, atextline, ahymns } = processHymnString(body);
      var latex = extractHymnsToPamphlet(aname, atextline, imageName, ahymns);

      // Save .txt file
      var fileName = sender + ".txt";
      var files = folder.getFilesByName(fileName);
      while (files.hasNext()) {
        var file = files.next();
        folder.removeFile(file);
      }

      folder.createFile(fileName, latex, MimeType.PLAIN_TEXT);

      allLines.push(...latex.split('\n'), "", "");
    });
  });

  if (allLines.length > 0) {
    pamphletSheet.getRange(1, 1, allLines.length, 1)
                 .setValues(allLines.map(line => [line]));
  }

  Logger.log("Finished processing all <FP> emails and updated Pamphlet tab.");
}

function extractAndSaveImage(message, folder) {
  var attachments = message.getAttachments();
  for (var att of attachments) {
    if (att.getContentType().startsWith('image/')) {
      var safeName = att.getName().replace(/[^a-zA-Z0-9.-]/g, '_').replace(/\.+/, '.');
      var files = folder.getFilesByName(safeName);
      while (files.hasNext()) {
        var file = files.next();
        folder.removeFile(file);
      }
      folder.createFile(att.copyBlob().setName(safeName));
      return safeName;
    }
  }
  return "image.jpg";
}


/**
 * Parses email body into title, subtitle, and hymn references
 */
function processHymnString(inputString) {
  var lines = inputString.split('\n').map(l => l.trim()).filter(l => l);
  var aname = lines[0] || "";
  var atextline = lines[1] || "";
  var ahymns = [];

  lines.slice(2).forEach(line => {
    var m = line.match(/^(.*?)(\d+)$/);
    ahymns.push(m ? [m[1].trim(), m[2]] : [line.trim(), ""]);
  });

  return { aname, atextline, ahymns };
}

/**
 * Generates LaTeX pamphlet from parsed hymns
 */
function extractHymnsToPamphlet(aname, atextline, aimage, ahymns) {
  var ss = SpreadsheetApp.openById('1apy0KAiVw4C8Cr8hexmdom0xQjvh8gvMjs3U-GraS9c');
  var latex = `
\\documentclass[15pt]{article}
\\usepackage{FP}
\\usepackage{graphicx}
\\usepackage{multicol}
\\begin{document}

\\begin{titlepage}
  \\centering
  \\vspace*{0.1\\textheight}
  {\\fontsize{60}{72}\\selectfont \\bfseries ${escapeLaTeX(aname)} \\par}
  \\vspace{0.1\\textheight}
  \\includegraphics[height=0.3\\textheight,keepaspectratio]{${escapeLaTeX(aimage)}}
  \\par\\vspace{0.1\\textheight}
  {\\huge ${escapeLaTeX(atextline)} \\par}
\\end{titlepage}

\\clearpage
\\begin{multicols}{2}
\\setlength{\\columnseprule}{0.3pt}
`;

  ahymns.forEach(hymn => {
    var [book, numStr] = hymn;
    var num = parseInt(numStr);
    var sheet = ss.getSheetByName(book);
    var template = {
      heading: '',
      localHeading: `Hymn ${num} (${book})`,
      engChorus: '',
      stanzas: [],
      chorus: '',
      hymnNum: null
    };

    if (sheet) {
      var colA = sheet.getRange('A1:A' + sheet.getLastRow()).getValues().flat();
      var data = parseHymnData(colA);
      if (data[num]) template = data[num];
    } else {
      Logger.log(`Tab "${book}" not found; using default for hymn ${num}.`);
    }

    var heading = template.heading || template.localHeading;

    var title = escapeLaTeX(heading);
    var ht = template.hymnNum ? `${title}...${escapeLaTeX('#' + template.hymnNum)}` : title;

    latex += `\\begin{hymn}{${num}}{${title}}
\\hymntitlewithdropcap{${num}}{${ht}}
`;

  template.stanzas.forEach((s, i) => {
  latex += `\\begin{stanza}\n${s}\n\\end{stanza}\n`;
  if (i === 0 && template.chorus) {
    var fc = template.chorus.split('\n')[0].replace(/\\\\+$/, ''); // remove trailing \\ 
    //fc = escapeLaTeX(fc);
    latex += `\\begin{chorus}\n\\setchorusline{${fc}}\n${template.chorus}\n\\end{chorus}\n`;
  }
});

    latex += "\\end{hymn}\n\n";
  });

  latex += `
\\end{multicols}
\\end{document}
`;

  return latex;
}

/**
 * Parses parsed sheet A‑column into structured hymn objects
 */
function parseHymnData(lines) {
  var hymns = {}, cur = null, stanzas = [], chorusLines = [], inStanza = false, inChorus = false;

  lines.forEach(l => {
    if (!l) {
      if (cur) {
        if (inStanza) { cur.stanzas.push(stanzas.join('\\\\\n')); stanzas = []; inStanza = false; }
        if (inChorus) { cur.chorus = chorusLines.join('\\\\\n'); chorusLines = []; inChorus = false; }
      }
      return;
    }

    if (/^Nr\s+(\d+)/i.test(l)) {
      if (cur) hymns[cur.nr] = cur;
      cur = { nr: +RegExp.$1, hymnNum: null, heading: '', localHeading: '', engChorus: '', stanzas: [], chorus: '' };
      return;
    }
    if (!cur) return;
    if (/^Hymn\s*#\s*(\d+)/i.test(l)) cur.hymnNum = +RegExp.$1;
    else if (/^Heading:\s*(.+)/i.test(l)) cur.heading = RegExp.$1;
    else if (/^LocalHeading:\s*(.+)/i.test(l)) cur.localHeading = RegExp.$1;
    else if (/^EngChorus:\s*(.+)/i.test(l)) cur.engChorus = RegExp.$1;
    else if (/^\d+\s+/.test(l)) {
      if (inStanza) { cur.stanzas.push(stanzas.join('\\\\\n')); stanzas = []; }
      inStanza = true; inChorus = false;
      stanzas.push(escapeLaTeX(
  l.replace(/^\d+\s+/, '')
   .replace(/[{}]/g, '')
   .replace(/ -- /g, '')
   .replace(/ _ /g, '')
   .replace(/ _/g, '')
));
    }
    else if (/^Chorus:/i.test(l)) {
      if (inStanza) { cur.stanzas.push(stanzas.join('\\\\\n')); stanzas = []; inStanza = false; }
      inChorus = true; chorusLines = [];
      chorusLines.push(escapeLaTeX(
  l.replace(/^Chorus:\s*/, '')
   .replace(/[{}]/g, '')
   .replace(/ -- /g, '')
   .replace(/ _ /g, '')
   .replace(/ _/g, '')
));
    }
    else if (inStanza) stanzas.push(escapeLaTeX(
  l.replace(/^\d+\s+/, '')
   .replace(/[{}]/g, '')
   .replace(/ -- /g, '')
   .replace(/ _ /g, '')
   .replace(/ _/g, '')
))
    else if (inChorus) chorusLines.push(escapeLaTeX(
  l.replace(/^Chorus:\s*/, '')
   .replace(/[{}]/g, '')
   .replace(/ -- /g, '')
   .replace(/ _ /g, '')
   .replace(/ _/g, '')
));
  });

  if (cur) hymns[cur.nr] = cur;
  return hymns;
}

/**
 * Escapes all special characters for LaTeX compatibility
 */
function escapeLaTeX(str) {
  var map = {
    '\\': '\\textbackslash{}', '{': '\\{', '}': '\\}', '$': '\\$', '&': '\\&',
    '#': '\\#', '_': '\\_', '%': '\\%', '~': '\\textasciitilde{}',
    '^': '\\textasciicircum{}', '“': '``', '”': "''", '‘': '`', '’': "'"
  };
  return str.replace(/[\\"{}$&#_%~^“”‘’]/g, c => map[c] || c);
}
