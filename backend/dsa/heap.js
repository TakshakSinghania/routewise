/**
 * Custom Min-Binary Heap implementation for priority queues.
 * Used primarily in Dijkstra's and A* search algorithms.
 * 
 * Time Complexities:
 * - push(val): O(log N)
 * - pop(): O(log N)
 * - peek(): O(1)
 * 
 * Space Complexity: O(N) where N is the number of elements in the heap.
 */
class MinHeap {
  constructor(scoreFunction = (a) => a) {
    this.heap = [];
    this.scoreFunction = scoreFunction;
  }

  push(element) {
    this.heap.push(element);
    this._bubbleUp(this.heap.length - 1);
  }

  pop() {
    const min = this.heap[0];
    const end = this.heap.pop();
    if (this.heap.length > 0) {
      this.heap[0] = end;
      this._sinkDown(0);
    }
    return min;
  }

  peek() {
    return this.heap[0];
  }

  size() {
    return this.heap.length;
  }

  isEmpty() {
    return this.heap.length === 0;
  }

  _bubbleUp(n) {
    const element = this.heap[n];
    const score = this.scoreFunction(element);
    while (n > 0) {
      const parentN = Math.floor((n + 1) / 2) - 1;
      const parent = this.heap[parentN];
      if (score >= this.scoreFunction(parent)) break;
      this.heap[parentN] = element;
      this.heap[n] = parent;
      n = parentN;
    }
  }

  _sinkDown(n) {
    const length = this.heap.length;
    const element = this.heap[n];
    const elemScore = this.scoreFunction(element);

    while (true) {
      const child2N = (n + 1) * 2;
      const child1N = child2N - 1;
      let swap = null;
      let child1Score;

      if (child1N < length) {
        const child1 = this.heap[child1N];
        child1Score = this.scoreFunction(child1);
        if (child1Score < elemScore) {
          swap = child1N;
        }
      }

      if (child2N < length) {
        const child2 = this.heap[child2N];
        const child2Score = this.scoreFunction(child2);
        if (child2Score < (swap === null ? elemScore : child1Score)) {
          swap = child2N;
        }
      }

      if (swap === null) break;

      this.heap[n] = this.heap[swap];
      this.heap[swap] = element;
      n = swap;
    }
  }
}

module.exports = MinHeap;
