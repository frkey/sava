import type { FilesPort } from '../services/ports';

type Folder = GoogleAppsScript.Drive.Folder;

function getOrCreateFolder(parent: Folder, name: string): Folder {
  const existing = parent.getFoldersByName(name);
  if (existing.hasNext()) return existing.next();
  return parent.createFolder(name);
}

/** Drive-backed FilesPort. Folder tree: {rootFolderId}/pdfs/{folderToken}/{cityName}/. */
export function driveFiles(rootFolderId: string): FilesPort {
  return {
    savePdf: (folderToken, cityName, fileName, base64) => {
      const root = DriveApp.getFolderById(rootFolderId);
      const pdfsFolder = getOrCreateFolder(root, 'pdfs');
      const periodFolder = getOrCreateFolder(pdfsFolder, folderToken);
      const cityFolder = getOrCreateFolder(periodFolder, cityName);

      const duplicates = cityFolder.getFilesByName(fileName);
      while (duplicates.hasNext()) duplicates.next().setTrashed(true);

      const bytes = Utilities.base64Decode(base64);
      const blob = Utilities.newBlob(bytes, 'application/pdf', fileName);
      const file = cityFolder.createFile(blob);
      return { fileId: file.getId(), url: file.getUrl() };
    },
    readPdf: (fileId) => {
      const file = DriveApp.getFileById(fileId);
      return { fileName: file.getName(), base64: Utilities.base64Encode(file.getBlob().getBytes()) };
    },
  };
}
