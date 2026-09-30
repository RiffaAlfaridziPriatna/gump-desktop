import {FileAsset} from '@services/upload/types';

export type FilenamePartitionResult = {
  accepted: FileAsset[];
  rejectedNames: string[];
};

/**
 * Exact `file.name` match only. Keeps the first occurrence; later same names
 * (vs existing set or earlier in this pick) go to rejectedNames.
 */
export function partitionFilesByFilename(
  existingNames: Set<string>,
  files: FileAsset[],
): FilenamePartitionResult {
  const occupied = new Set(existingNames);
  const accepted: FileAsset[] = [];
  const rejectedNames: string[] = [];

  for (const file of files) {
    const name = file.name;
    if (occupied.has(name)) {
      rejectedNames.push(name);
      continue;
    }
    occupied.add(name);
    accepted.push(file);
  }

  return {accepted, rejectedNames};
}
