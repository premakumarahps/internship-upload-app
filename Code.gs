const FILE_FIELDS = {
  finalPresentation: "finalPresentation",
  finalReport: "finalReport",
  week1: "1st_6th_weekReport",
  week2: "2nd_6th_weekReport",
  week3: "3rd_6th_weekReport",
  week4: "4th_6th_weekReport",
  internDiary: "internDiary" // Optional
};

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index');
}

function checkIndex(index) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Company");
  const data = sheet.getRange("A2:B" + sheet.getLastRow()).getValues();

  let company = null;
  let rowIndex = -1;
  let allCompanyIndexes = [];

  for (let i = 0; i < data.length; i++) {
    const sheetIndex = data[i][0].toString().trim();
    const sheetCompany = data[i][1].toString().trim();
    if (sheetIndex === index) {
      company = sheetCompany;
      rowIndex = i + 2;
    }
    if (sheetCompany) allCompanyIndexes.push(sheetCompany);
  }

  if (!company) return { status: "NOT_FOUND" };

  const isMultiStudent = allCompanyIndexes.filter(c => c === company).length > 1;
  const existingFiles = getUploadedFiles(index, company, isMultiStudent);

  const requiredFiles = Object.values(FILE_FIELDS).slice(0, 6); // First 6 only
  const hasAllRequired = requiredFiles.every(file => existingFiles.includes(`${index}_${file}`));

  if (hasAllRequired) return { status: "ALREADY_SUBMITTED", company };

  const uploaded = existingFiles
    .filter(name => name.startsWith(index + "_"))
    .map(name => name.replace(`${index}_`, ''));

  const remaining = Object.entries(FILE_FIELDS)
    .filter(([key, suffix]) => !uploaded.includes(suffix))
    .map(([key]) => key);

  return {
    status: "PENDING",
    company,
    multipleStudents: isMultiStudent,
    uploaded,
    remaining
  };
}

function uploadMultipleFiles(data) {
  const { files, index, company, multipleStudents } = data;
  const folder = getStudentFolder(company, index, multipleStudents, true);

  for (let fieldKey in files) {
    const fileData = files[fieldKey];
    const suffix = FILE_FIELDS[fieldKey];
    if (!suffix || !fileData || !fileData.content) continue;

    const originalNameParts = fileData.fileName.split(".");
    const ext = originalNameParts.length > 1 ? originalNameParts.pop() : "";
    const fileName = `${index}_${suffix}${ext ? "." + ext : ""}`;

    // Remove any existing file
    const existing = folder.getFilesByName(fileName);
    while (existing.hasNext()) {
      existing.next().setTrashed(true);
    }

    const blob = Utilities.newBlob(Utilities.base64Decode(fileData.content), fileData.mimeType, fileName);
    folder.createFile(blob);
  }

  const required = Object.values(FILE_FIELDS).slice(0, 6);
  const uploadedNames = getUploadedFiles(index, company, multipleStudents);
  const isComplete = required.every(type => uploadedNames.includes(`${index}_${type}`));

  updateSheetStatus(index, isComplete);
  return { status: "SUCCESS" };
}

function updateSheetStatus(index, complete) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Company");
  const data = sheet.getRange("A2:A" + sheet.getLastRow()).getValues();

  for (let i = 0; i < data.length; i++) {
    if (data[i][0].toString().trim() === index) {
      sheet.getRange("C" + (i + 2)).setValue(complete ? "✓" : "Not Complete");
      return;
    }
  }
}

function getUploadedFiles(index, company, useSubFolder) {
  const folder = getStudentFolder(company, index, useSubFolder, false);
  if (!folder) return [];

  const files = folder.getFiles();
  const names = [];
  while (files.hasNext()) {
    const name = files.next().getName();
    const base = name.includes(".") ? name.substring(0, name.lastIndexOf(".")) : name;
    names.push(base);
  }
  return names;
}

function getStudentFolder(company, index, useSubFolder, createIfMissing = true) {
  const base = getOrCreateFolder("Industrial Training", null, createIfMissing);
  const companyFolder = getOrCreateFolder(company, base, createIfMissing);
  if (!companyFolder && !createIfMissing) return null;

  return useSubFolder ? getOrCreateFolder(index, companyFolder, createIfMissing) : companyFolder;
}

function getOrCreateFolder(name, parent, create = true) {
  const folders = parent ? parent.getFoldersByName(name) : DriveApp.getFoldersByName(name);
  if (folders.hasNext()) return folders.next();
  if (!create) return null;
  return parent ? parent.createFolder(name) : DriveApp.createFolder(name);
}
