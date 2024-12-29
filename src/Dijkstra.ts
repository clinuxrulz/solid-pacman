export class Dijkstra {
    level: string[][];
    distances: (number | undefined)[][];
    queue: number[] = [];

    constructor(params: {
        level: string[][],
    }) {
        this.level = params.level;
        this.distances = params.level.map((row) => new Array(row.length).fill(undefined));
    }

    updateDistanceToTarget(params: {
        target: { xIdx: number, yIdx: number, },
    }) {
        const measureTime = false;
        let startTime: number = 0;
        if (measureTime) {
            startTime = performance.now();
        }
        for (let i = 0; i < this.distances.length; ++i) {
            let row = this.distances[i];
            for (let j = 0; j < row.length; ++j) {
                row[j] = undefined;
            }
        }
        let target = params.target;
        this.distances[target.yIdx][target.xIdx] = 0.0;
        this.queue.push(target.xIdx, target.yIdx);
        while (true) {
            let xIdx = this.queue.shift();
            let yIdx = this.queue.shift();
            if (xIdx == undefined || yIdx == undefined) {
                break;
            }
            let nextDist = this.distances[yIdx][xIdx]! + 1.0;
            // Up
            if (yIdx > 0) {
                if (
                    this.level[yIdx-1][xIdx] != "*" &&
                    this.distances[yIdx-1][xIdx] == undefined
                ) {
                    this.distances[yIdx-1][xIdx] = nextDist;
                    this.queue.push(xIdx, yIdx-1);
                }
            }
            // Down
            if (yIdx < this.distances.length-1) {
                if (
                    this.level[yIdx+1][xIdx] != "*" &&
                    this.distances[yIdx+1][xIdx] == undefined
                ) {
                    this.distances[yIdx+1][xIdx] = nextDist;
                    this.queue.push(xIdx, yIdx+1);
                }
            }
            // Left
            if (xIdx > 0) {
                if (
                    this.level[yIdx][xIdx-1] != "*" &&
                    this.distances[yIdx][xIdx-1] == undefined
                ) {
                    this.distances[yIdx][xIdx-1] = nextDist;
                    this.queue.push(xIdx-1, yIdx);
                }
            }
            // Right
            if (xIdx < this.distances[yIdx].length-1) {
                if (
                    this.level[yIdx][xIdx+1] != "*" &&
                    this.distances[yIdx][xIdx+1] == undefined
                ) {
                    this.distances[yIdx][xIdx + 1] = nextDist;
                    this.queue.push(xIdx+1, yIdx);
                }
            }
        }
        if (measureTime) {
            let endTime = performance.now();
            console.log(`time taken: ${endTime - startTime}`);
        }
    }
}
