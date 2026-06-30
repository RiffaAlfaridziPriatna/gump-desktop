import {hammingDistance} from '@lib/perceptualHash';

type BKNode = {
  hash: string;
  photoId: string;
  children: Map<number, BKNode>;
};

/**
 * BK-Tree (Burkhard-Keller Tree) for efficient nearest-neighbor search
 * in discrete metric spaces. Optimized for perceptual hash lookups.
 *
 * Time complexity:
 * - Insert: O(log n) average case
 * - Search: O(log n) average case (vs O(n) for linear search)
 */
export class BKTree {
  private root: BKNode | null = null;

  /**
   * Insert a perceptual hash into the tree
   */
  insert(hash: string, photoId: string): void {
    const node: BKNode = {hash, photoId, children: new Map()};

    if (!this.root) {
      this.root = node;
      return;
    }

    let current = this.root;
    while (true) {
      const distance = hammingDistance(current.hash, hash);

      if (distance === 0) {
        return;
      }

      const child = current.children.get(distance);
      if (!child) {
        current.children.set(distance, node);
        return;
      }

      current = child;
    }
  }

  /**
   * Find all photo IDs with perceptual hashes within maxDistance
   * of the query hash (using Hamming distance)
   */
  findWithinDistance(hash: string, maxDistance: number): string[] {
    if (!this.root) {
      return [];
    }

    const results: string[] = [];
    const queue: BKNode[] = [this.root];

    while (queue.length > 0) {
      const node = queue.shift()!;
      const distance = hammingDistance(node.hash, hash);

      if (distance <= maxDistance) {
        results.push(node.photoId);
      }

      const minChild = Math.max(0, distance - maxDistance);
      const maxChild = distance + maxDistance;

      for (let d = minChild; d <= maxChild; d++) {
        const child = node.children.get(d);
        if (child) {
          queue.push(child);
        }
      }
    }

    return results;
  }

  /**
   * Clear the tree
   */
  clear(): void {
    this.root = null;
  }

  /**
   * Get the number of nodes in the tree (for testing/debugging)
   */
  size(): number {
    if (!this.root) {
      return 0;
    }

    let count = 0;
    const queue: BKNode[] = [this.root];

    while (queue.length > 0) {
      const node = queue.shift()!;
      count++;

      for (const child of node.children.values()) {
        queue.push(child);
      }
    }

    return count;
  }
}
