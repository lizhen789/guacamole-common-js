import {isNumber} from "es-toolkit/compat";

/**
 * Integer pool which returns consistently increasing integers while integers
 * are in use, and previously-used integers when possible.
 */
class IntegerPool {
  /**
   * Array of available integers.
   */
  private pool: number[] = [];

  /**
   * The next integer to return if no more integers remain in the pool.
   */
  public nextInt: number = 0;

  /**
   * Returns the next available integer in the pool. If possible, a previously
   * used integer will be returned.
   *
   * @returns The next available integer.
   */
  next(): number {
    // If free'd integers exist, return one of those
    if (this.pool.length > 0) {
      return this.pool.shift()!;
    }

    // Otherwise, return a new integer
    return this.nextInt++;
  }

  /**
   * Frees the given integer, allowing it to be reused.
   *
   * @param integer The integer to free.
   */
  free(integer: number): void {
    // Ensure integer is a number
    if (!isNumber(integer)) {
      throw new Error('Only integers can be freed');
    }

    // Ensure integer is non-negative
    if (integer < 0) {
      throw new Error('Cannot free negative integers');
    }

    // Add to pool
    this.pool.push(integer);
  }

  /**
   * Returns the number of integers currently available in the pool.
   *
   * @returns The number of integers currently available in the pool.
   */
  getSize(): number {
    return this.pool.length;
  }

  /**
   * Clears the pool, discarding all available integers. This will not affect
   * integers that have been allocated but not yet freed.
   */
  clear(): void {
    this.pool = [];
  }
}

// 导出类供其他模块使用
export default IntegerPool;