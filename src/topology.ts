export function wrap(n: number, size: number = 8): number {
  return ((n % size) + size) % size;
}

export function wrapMirror(row: number, col: number, size: number = 8): [number, number, boolean] {
  const newCol = ((col % size) + size) % size;
  let newRow = row;
  let flipped = false;

  while (newRow < 0 || newRow > size - 1) {
    if (newRow < 0) {
      newRow = -1 - newRow;
      flipped = !flipped;
    } else if (newRow > size - 1) {
      newRow = (size * 2 - 1) - newRow;
      flipped = !flipped;
    }
  }

  return [newRow, newCol, flipped];
}
