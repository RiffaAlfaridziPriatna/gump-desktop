import {computePerceptualHash as computeNativePerceptualHash} from '@lib/storage/localStorage';

export function hammingDistance(hexA: string, hexB: string): number {
  const valueA = BigInt(`0x${hexA}`);
  const valueB = BigInt(`0x${hexB}`);
  let xor = valueA ^ valueB;
  let distance = 0;

  while (xor > 0n) {
    distance += Number(xor & 1n);
    xor >>= 1n;
  }

  return distance;
}

export async function computeImagePerceptualHash(
  uri: string,
): Promise<string | null> {
  const hash = await computeNativePerceptualHash(uri);
  if (!hash || !/^[0-9a-f]{16}$/i.test(hash)) {
    return null;
  }
  return hash.toLowerCase();
}

