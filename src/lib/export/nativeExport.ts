import {NativeModules, Platform} from 'react-native';
import type {
  ExportDirectoryInfo,
  ExportZipEntry,
  ExportZipResult,
} from './types';

type NativeExportModule = {
  ensureDefaultExportDirectory: () => Promise<ExportDirectoryInfo>;
  ensureExportStagingDirectory: () => Promise<ExportDirectoryInfo>;
  pickExportDirectory: () => Promise<ExportDirectoryInfo | null>;
  resolveUniqueZipPath: (directory: string, fileName: string) => Promise<string>;
  createZipFromEntries: (
    entries: ExportZipEntry[],
    zipPath: string,
  ) => Promise<{
    path: string;
    uri: string;
    fileName: string;
    byteSize: number;
  }>;
  copyFile: (
    sourcePath: string,
    destinationPath: string,
  ) => Promise<{
    path: string;
    uri: string;
    fileName: string;
    byteSize: number;
  }>;
  openInFileManager: (path: string) => Promise<boolean>;
};

const NativeLocalStorage = NativeModules.GumpLocalStorage as
  | NativeExportModule
  | undefined;

const EXPORT_PLATFORMS = new Set(['macos', 'windows']);

function hasNativeExport(): boolean {
  return (
    EXPORT_PLATFORMS.has(Platform.OS) &&
    NativeLocalStorage?.createZipFromEntries != null &&
    NativeLocalStorage?.ensureDefaultExportDirectory != null &&
    NativeLocalStorage?.ensureExportStagingDirectory != null &&
    NativeLocalStorage?.copyFile != null
  );
}

export function assertNativeExportAvailable(): void {
  if (!hasNativeExport()) {
    throw new Error(
      'Local export is not available. Build the app with GumpLocalStorage export APIs.',
    );
  }
}

export async function ensureDefaultExportDirectory(): Promise<ExportDirectoryInfo> {
  assertNativeExportAvailable();
  return NativeLocalStorage!.ensureDefaultExportDirectory();
}

export async function ensureExportStagingDirectory(): Promise<ExportDirectoryInfo> {
  assertNativeExportAvailable();
  return NativeLocalStorage!.ensureExportStagingDirectory();
}

export async function pickExportDirectory(): Promise<ExportDirectoryInfo | null> {
  assertNativeExportAvailable();
  return NativeLocalStorage!.pickExportDirectory();
}

export async function resolveUniqueZipPath(
  directory: string,
  fileName: string,
): Promise<string> {
  assertNativeExportAvailable();
  return NativeLocalStorage!.resolveUniqueZipPath(directory, fileName);
}

export async function createZipFromEntries(
  entries: ExportZipEntry[],
  zipPath: string,
): Promise<Omit<ExportZipResult, 'displayPath' | 'photoCount'>> {
  assertNativeExportAvailable();
  return NativeLocalStorage!.createZipFromEntries(entries, zipPath);
}

export async function copyExportFile(
  sourcePath: string,
  destinationPath: string,
): Promise<Omit<ExportZipResult, 'displayPath' | 'photoCount'>> {
  assertNativeExportAvailable();
  return NativeLocalStorage!.copyFile(sourcePath, destinationPath);
}

export async function openInFileManager(path: string): Promise<boolean> {
  assertNativeExportAvailable();
  return NativeLocalStorage!.openInFileManager(path);
}
