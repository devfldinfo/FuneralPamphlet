const ghUsername = "devfldinfo";
const ghToken = "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";
const ghRepo = "FuneralPamphlet";
const ghBranch = "main";
const ssFP = "1IhpAAN-465jyUFP0iqgKgNPcUpR8TL0GWc82xujsmQI";
const fldFPWorkFiles = "1SmNVK3TDo2oa1V5N-D8SQGNB3LikkI4h";
const fldFPPDFs = "1BJ6DTOdjhouWZBudwkwPmBN1ykYS8fJY";
const fldFPStartFile = "1BebiCoFpTq3AydBFV-hoYIxVn6cwPkR-";

//This function is scheduled on RSAFuneralPamphlets every 5 minutes
function checkAndGeneratePamphlets() {
  deleteFilesInFolder(fldFPWorkFiles);
  generateHymnPamphletsFromAllEmails();
}

//This function is scheduled on RSAFuneralPamphlets every 1 minute
function downloadAndSendPamphlets() {
  if(!InprogressFileExists())
  {
    deleteFilesInFolder(fldFPPDFs);
    downloadGithubFiles("print.pdf");
    emailAndCleanPdfPamphlets();
    deleteFilesFromGitHub("output");
  }
}

function InprogressFileExists() {
  const filePath = "input/inprogress.inprogress";
  const apiUrl = `https://api.github.com/repos/${ghUsername}/${ghRepo}/contents/${filePath}?ref=${ghBranch}`;

  Logger.log(`Checking for file: ${apiUrl}`);

  const options = {
    method: "get",
    headers: {
      "Authorization": `Bearer ${ghToken}`,
      "Accept": "application/vnd.github.v3+json",
      "User-Agent": "Google-Apps-Script-GitHub-Checker" // Required by GitHub API
    },
    muteHttpExceptions: true // Crucial to prevent script from crashing on 404s
  };

  try {
    const response = UrlFetchApp.fetch(apiUrl, options);
    const responseCode = response.getResponseCode();

    if (responseCode === 200) {
      Logger.log(`File '${filePath}' exists in '${ghBranch}' branch.`);
      return true;
    } else if (responseCode === 404) {
      Logger.log(`File '${filePath}' DOES NOT exist in '${ghBranch}' branch.`);
      return false;
    } else {
      // Handle other API errors
      const errorBody = response.getContentText();
      Logger.log(`GitHub API error (Code: ${responseCode}): ${errorBody}`);
      throw new Error(`Failed to check file existence. GitHub API returned ${responseCode}: ${errorBody}`);
    }
  } catch (e) {
    Logger.log(`Error during API call: ${e.message}`);
    throw new Error(`Could not connect to GitHub API: ${e.message}`);
  }
}

function downloadGithubFiles(asuffix) {
  var owner = ghUsername;
  var repo = ghRepo;
  var folder = "output";
  var token = ghToken;
  //var acounter = 0;
  //var afilesdownloaded  =0;

  var githubUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${folder}`;
  var options = {
    method: "get",
    headers: {
      "Authorization": "token " + token
    },
    muteHttpExceptions: true
  };

  var response = UrlFetchApp.fetch(githubUrl, options);
  if (response.getResponseCode() !== 200) {
    Logger.log("Error fetching files: " + response.getContentText());
    return;
  }

  var files = JSON.parse(response.getContentText());
  var driveFolder = getOrCreateFolder(fldFPPDFs);

  files.forEach(function (file) {
    //if(acounter>=astart && afilesdownloaded<60)
    if (file.name.toLowerCase().endsWith(asuffix) && file.download_url) {
      var success = false;
      var attempts = 0;

      while (!success && attempts < 3) { // Retry up to 3 times
        try {
          var fileResponse = UrlFetchApp.fetch(file.download_url, options);
          if (fileResponse.getResponseCode() === 200) {
            var blob = fileResponse.getBlob().setName(file.name);
            driveFolder.createFile(blob);
            Logger.log("Downloaded: " + file.name);
            success = true;
          } else {
            Logger.log("Attempt " + (attempts + 1) + " failed for: " + file.name);
            Utilities.sleep(10000); // Wait 3 seconds before retrying
          }
        } catch (e) {
          Logger.log("Attempt " + (attempts + 1) + " failed with error: " + e.toString());
          Utilities.sleep(10000) ;
        }
        attempts++;
      }

      if (!success) {
        Logger.log("Failed to download: " + file.name + " after 3 attempts.");
      }
      Utilities.sleep(1000); // Small delay between downloads
    }
  });

  Logger.log("Download process completed.");
}

function deleteFilesFromGitHub(folderPath) {
  var token = ghToken;  // Replace with your GitHub token
  var owner = ghUsername;  // Replace with your GitHub username
  var repo = ghRepo;   // Replace with your repo name
  var branch = ghBranch;  // Change if needed

  var apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${folderPath}`;
  var headers = {
    "Authorization": "token " + token,
    "Accept": "application/vnd.github.v3+json"
  };

  var response = UrlFetchApp.fetch(apiUrl, { method: "get", headers: headers });
  var files = JSON.parse(response.getContentText());

  files.forEach(file => {
    if (file.name.endsWith(".start") || file.name.endsWith(".txt") || file.name.endsWith(".pdf") || file.name.endsWith(".jpg")) {
      var deleteUrl = file.url;
      var fileSha = file.sha;

      var payload = JSON.stringify({ message: "Delete " + file.name, sha: fileSha, branch: branch });

      UrlFetchApp.fetch(deleteUrl, { method: "delete", headers: headers, payload: payload });
    }
  });

  Logger.log('Deleted all files in the ' + folderPath + ' folder.');
}

function uploadFilesToGitHub(folderName) {
  var githubToken = ghToken; // Replace with your new GitHub token
  var owner = ghUsername; // Your GitHub username
  var repo = ghRepo; // Your GitHub repository name
  var githubFolder = "input/"; // GitHub folder path
  var branch = ghBranch; // Change if needed

  var folder = getOrCreateFolder(folderName);
  if (!folder) {
    Logger.log("Folder '" + folderName + "' not found in Google Drive.");
    return;
  }

  var files = folder.getFiles();
  while (files.hasNext()) {
    var file = files.next();
    var fileName = file.getName();
    var fileContent = Utilities.base64Encode(file.getBlob().getBytes());

    var apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${githubFolder}${fileName}`;

    var payload = {
      message: "Upload " + fileName,
      content: fileContent,
      branch: branch
    };

    var options = {
      method: "put",
      headers: {
        "Authorization": "token " + githubToken,
        "Accept": "application/vnd.github.v3+json"
      },
      payload: JSON.stringify(payload)
    };

    try {
      var response = UrlFetchApp.fetch(apiUrl, options);
      Logger.log("Uploaded: " + fileName);
    } catch (e) {
      Logger.log("Error uploading " + fileName + ": " + e.toString());
    }
  }
}

//Google Drive Functions
// Helper function to get or create a folder
function getOrCreateFolder(folderName) {
  return DriveApp.getFolderById(folderName);
//  return folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
}

function saveToTextFile(afolder, fileName, content) {
  var folder = getOrCreateFolder(afolder);
  var file = folder.createFile(fileName + " - View.txt", escapeSpecialCharacters(content));
  Logger.log("Text file created: " + fileName + " - View.txt");
}

function deleteFilesInFolder(folderName) {
  try {
    // Get the folder by name
    var folder = DriveApp.getFolderById(folderName);

    var files = folder.getFiles();

    while (files.hasNext()) {
      var file = files.next();
      Logger.log("Deleting file: " + file.getName());
      file.setTrashed(true); // Move file to trash
    }

    Logger.log("All files deleted in folder: " + folderName);
  } catch (e) {
    Logger.log("Error: " + e.toString());
  }
}

/**
 * Main entry point – loops all <FP> emails and processes them
 */
/**
* Main entry point – loops all <FP> emails and processes them
*/
function generateHymnPamphletsFromAllEmails() {
  var aCreatePamphlet = false;
  var threads = GmailApp.search('subject:"<FP>" is:unread');

  if (threads.length === 0) {
    Logger.log("No unread emails with '<FP>' in the subject found.");
    return;
  }

  var spreadsheet = SpreadsheetApp.openById(ssFP);
  var pamphletSheet = spreadsheet.getSheetByName('Pamphlet') || spreadsheet.insertSheet('Pamphlet');
  pamphletSheet.clear();

  var allLines = [];

  // Get or create the target folder for saving files
  var folderName = "FPWorkFiles";
  var folders = DriveApp.getFoldersByName(folderName);
  var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);

  threads.forEach(thread => {
    thread.getMessages().forEach(message => {
      if (!message.isUnread()) return;

      var body = message.getPlainBody().trim();
      // Get the full email address
      var fullSenderEmail = message.getFrom().match(/<(.+?)>/);
      var senderEmail = fullSenderEmail ? fullSenderEmail[1] : message.getFrom();
      
      // Format the datestamp
      var date = new Date();
      var dateStamp = Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss');

      // Replace '@' with '~' and append datestamp
      var safeSenderName = senderEmail.replace(/@/g, 'ATTSIGN');
      var fileName = safeSenderName + '_' + dateStamp + " - View.txt";

      // The 'folder' variable is now the "FPWorkFiles" folder
      var imageName = "input/"+extractAndSaveImage(message, folder);

      message.markRead();

      var { aname, atextline, ahymns } = processHymnString(body);
      var latex = extractHymnsToPamphlet(aname, atextline, imageName, ahymns);

      // Delete existing file with the exact new name (unlikely but good for consistency)
      var files = folder.getFilesByName(fileName);
      while (files.hasNext()) {
        var file = files.next();
        folder.removeFile(file);
      }

      folder.createFile(fileName, latex, MimeType.PLAIN_TEXT);

      allLines.push(...latex.split('\n'), "", "");
      aCreatePamphlet = true;
    });
  });

  if (allLines.length > 0) {
    pamphletSheet.getRange(1, 1, allLines.length, 1)
      .setValues(allLines.map(line => [line]));
  }

  Logger.log("Finished processing all <FP> emails. Files saved in '" + folder.getName() + "' folder.");

  if(aCreatePamphlet)
  {
    deleteFilesFromGitHub("input");
    uploadFilesToGitHub(fldFPWorkFiles);
    uploadFilesToGitHub(fldFPStartFile);
  }
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
  return "image.jpg"; // Default image if none found
}

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

function extractHymnsToPamphlet(aname, atextline, aimage, ahymns) {
  var ss = SpreadsheetApp.openById(ssFP);
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
 * Parses parsed sheet A‑column into structured hymn objects.
 * @param {Array<string>} lines The lines from column A of a hymn sheet.
 * @return {Object} A structured object of hymns, keyed by hymn number.
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
      stanzas.push(escapeLaTeX(removeSpecialChars(l.replace(/^\d+\s+/, ''))));
    }
    else if (/^Chorus:/i.test(l)) {
      if (inStanza) { cur.stanzas.push(stanzas.join('\\\\\n')); stanzas = []; inStanza = false; }
      inChorus = true; chorusLines = [];
      chorusLines.push(escapeLaTeX(removeSpecialChars(l.replace(/^Chorus:\s*/, ''))));
    }
    else if (inStanza) stanzas.push(escapeLaTeX(removeSpecialChars(l.replace(/^\d+\s+/, ''))));
    else if (inChorus) chorusLines.push(removeSpecialChars(escapeLaTeX(l.replace(/^Chorus:\s*/, ''))));
  });

  if (cur) {
    if (inStanza) cur.stanzas.push(stanzas.join('\\\\\n'));
    if (inChorus) cur.chorus = chorusLines.join('\\\\\n');
    hymns[cur.nr] = cur;
  }
  return hymns;
}

/**
 * Escapes all special characters for LaTeX compatibility.
 * @param {string} str The string to escape.
 * @return {string} The escaped string.
 */
function escapeLaTeX(str) {
  if (typeof str !== 'string') {
    return '';
  }
  var map = {
    '\\': '\\textbackslash{}', '{': '\\{', '}': '\\}', '$': '\\$', '&': '\\&',
    '#': '\\#', '_': '\\_', '%': '\\%', '~': '\\textasciitilde{}',
    '^': '\\textasciicircum{}', '“': '``', '”': "''", '‘': '`', '’': "'"
  };
  return str.replace(/[\\"{}$&#_%~^“”‘’]/g, c => map[c] || c);
}

function removeSpecialChars(str) {
  if (typeof str !== 'string') {
    return '';
  }

  let cleanedStr = str;
  cleanedStr = cleanedStr.replace(/ -- /g, ''); // Remove " -- " (space-dash-dash-space)
  cleanedStr = cleanedStr.replace(/ _ /g, '');  // Remove " _ " (space-underscore-space)
  cleanedStr = cleanedStr.replace(/ _/g, '');   // Remove " _" (space-underscore)
  cleanedStr = cleanedStr.replace(/\[/g, '');   // Remove "["
  cleanedStr = cleanedStr.replace(/\]/g, '');   // Remove "]"
  cleanedStr = cleanedStr.replace(/\{/g, '');   // Remove "{"
  cleanedStr = cleanedStr.replace(/\}/g, '');   // Remove "}"
  cleanedStr = cleanedStr.replace(/~~/g, '');   // Remove "~~"

return cleanedStr;
}

/**
 * Google Apps Script function to email PDF files from a specific Drive folder.
 *
 * It iterates through PDF files in the designated folder, extracts the
 * recipient's email address from the filename, sends an email with the
 * PDF as an attachment, and then deletes the PDF if the email is sent successfully.
 *
 * The email body is now read from a Google Spreadsheet.
 */
function emailAndCleanPdfPamphlets() {
  // Spreadsheet details for email body text
  const SPREADSHEET_ID = ssFP;
  const MESSAGE_SHEET_NAME = 'Message';
  const MESSAGE_RANGE = 'A1:A31';

  // --- Initialize emailBody from Spreadsheet ---
  let emailBody = "";
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const messageSheet = spreadsheet.getSheetByName(MESSAGE_SHEET_NAME);

    if (!messageSheet) {
      Logger.log("Error: Spreadsheet tab '" + MESSAGE_SHEET_NAME + "' not found in spreadsheet ID: " + SPREADSHEET_ID);
      return; // Exit if the message sheet is not found
    }

    const messageValues = messageSheet.getRange(MESSAGE_RANGE).getDisplayValues(); // Get values as displayed text
    // Join all rows into a single string, separated by newlines.
    // Filter out empty rows to avoid extra blank lines.
    emailBody = messageValues.map(row => row[0]).join('\n');

    if (emailBody.trim() === "") {
        Logger.log("Warning: Message range " + MESSAGE_RANGE + " in tab '" + MESSAGE_SHEET_NAME + "' is empty or contains only whitespace.");
    }
    Logger.log("Email body successfully loaded from spreadsheet:\n" + emailBody);

  } catch (e) {
    Logger.log("Error reading email body from spreadsheet ID '" + SPREADSHEET_ID + "': " + e.message);
    return; // Exit if cannot read message from spreadsheet
  }
  // --- End emailBody initialization ---


  // --- Access PDF folder ---
  try {
    var pdfFolder = DriveApp.getFolderById(fldFPPDFs);
  } catch (e) {
    Logger.log("Error: Could not access the PDF folder with ID '" + fldFPPDFs + "'. Please check the ID and permissions. " + e.message);
    return;
  }

  var pdfFiles = pdfFolder.getFilesByType(MimeType.PDF);
  var filesProcessed = 0;
  var filesEmailed = 0;

  if (!pdfFiles.hasNext()) {
    Logger.log("No PDF files found in folder: " + pdfFolder.getName() + " (ID: " + fldFPPDFs + ").");
    return;
  }

  Logger.log("Starting to process PDF files in folder: " + pdfFolder.getName());

  while (pdfFiles.hasNext()) {
    var file = pdfFiles.next();
    var fileName = file.getName();
    filesProcessed++;

    Logger.log("Processing file: " + fileName);

    // Expected filename format: recipient.email_AT_domain.com_datestamp.pdf
    var emailPartMatch = fileName.match(/^([^_]+?)_/);

    if (!emailPartMatch || emailPartMatch.length < 2) {
      Logger.log("Skipping file '" + fileName + "': Filename does not match expected email_AT_datestamp format (missing _datestamp).");
      continue;
    }

    var recipientEmail = emailPartMatch[1].replace(/ATTSIGN/g, '@');

    if (!recipientEmail || !recipientEmail.includes('@') || !recipientEmail.includes('.')) {
      Logger.log("Skipping file '" + fileName + "': Extracted recipient email '" + recipientEmail + "' appears invalid.");
      continue;
    }

    const emailSubject = "Funeral Pamphlet Ready";

    try {
      GmailApp.sendEmail(recipientEmail, emailSubject, emailBody, { // Use the dynamically loaded emailBody
        attachments: [file.getAs(MimeType.PDF)],
        name: 'Automated Pamphlet Sender'
      });
      Logger.log("Successfully emailed '" + fileName + "' to '" + recipientEmail + "'.");

      file.setTrashed(true);
      Logger.log("Deleted PDF file: " + fileName);
      filesEmailed++;

    } catch (e) {
      Logger.log("Failed to email '" + fileName + "' to '" + recipientEmail + "'. Error: " + e.message);
    }
  }

  var message = "Finished processing " + filesProcessed + " PDF files. Successfully emailed " + filesEmailed + ".";
  Logger.log(message);
}
