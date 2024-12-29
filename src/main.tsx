import { render } from "solid-js/web";
import {
  For,
  Index,
  Match,
  Show,
  Switch,
  batch,
  createEffect,
  createMemo,
  createResource,
  createSignal,
  onCleanup,
  untrack,
} from "solid-js";
import type { Accessor, Component, JSX } from "solid-js";
import { createStore } from "solid-js/store";
import type { SetStoreFunction, Store } from "solid-js/store";
import { Sounds } from "./Sounds";
import { Dijkstra } from "./Dijkstra";

const BLOCK_SIZE = 10;
const HALF_BLOCK_SIZE = BLOCK_SIZE / 2;
const WALL_THICKNESS = 2;

let sounds = await Sounds.load();
console.log(sounds);

type Level = string[][];

function loadLevel(data: string[]): Level {
  return data.map((x) =>
    new Array(x.length).fill(undefined).map((_, idx) => x.charAt(idx)),
  );
}

function findGhosts(data: string[]): GameState["ghosts"] {
  let result: GameState["ghosts"] = [];
  let atY = 0;
  for (let i = 0; i < data.length; ++i, atY += BLOCK_SIZE) {
    let row = data[i];
    let atX = 0;
    for (let j = 0; j < row.length; ++j, atX += BLOCK_SIZE) {
      let cell = row.charAt(j);
      if (cell == "G") {
        result.push({
          pos: { x: atX, y: atY, },
          faceDir: { x: 0, y: -1, },
          colour: genGhostColour(),
        });
      }
    }
  }
  return result;
}

const level = [
  "******************************",
  "******************************",
  "** ...........**............**",
  "**.****.*****.**.*****.****.**",
  "**o*  *.*   *.**.*   *.*  *o**",
  "**.****.*****.**.*****.****.**",
  "**..........................**",
  "**.****.**.********.**.****.**",
  "**.****.**.********.**.****.**",
  "**......**....**....**......**",
  "*******.***** ** *****.*******",
  "*******.***** ** *****.*******",
  "     **.**          **.**     ",
  "*******.** ***--*** **.*******",
  "*******.** ***  *** **.*******",
  "       .   **GGGG**   .       ",
  "*******.** ******** **.*******",
  "*******.** ******** **.*******",
  "     **.**          **.**     ",
  "*******.** ******** **.*******",
  "*******.** ******** **.*******",
  "**............**............**",
  "**.****.*****.**.*****.****.**",
  "**.****.*****.**.*****.****.**",
  "**o..**................**..o**",
  "****.**.**.********.**.**.****",
  "****.**.**.********.**.**.****",
  "**......**....**....**......**",
  "**.**********.**.**********.**",
  "**.**********.**.**********.**",
  "**..........................**",
  "******************************",
  "******************************",
];

const ghostColours: string[] = [
  "orange",
  "red",
  "pink",
  "cyan"
];

var genGhostColour = (() => {
  let nextIdx = 0;
  return () => {
    let idx = nextIdx;
    nextIdx = (nextIdx + 1) % ghostColours.length;
    return ghostColours[idx];
  };
})();

const App: Component = () => {
  return <Game />;
};

render(() => <App />, document.getElementById("app")!);

let appDiv = document.getElementById("app")!;
appDiv.style.setProperty("width", "100%");
appDiv.style.setProperty("height", "100%");
appDiv.style.setProperty("tabindex", "0");

type GameState = {
  pacMan:
    | {
        pos: { x: number; y: number };
        faceDir: { x: number; y: number };
        moving: boolean;
        bufferedMove: "Left" | "Right" | "Up" | "Down" | undefined;
        lastChompTime: number;
        dying: {
          animationIdx: number,
          animationLength: number,
        } | undefined,
      }
    | undefined;
  ghosts: {
    pos: { x: number, y: number, },
    faceDir: { x: number, y: number, },
    colour: string,
  }[];
  level: Level;
};

function Game(props: {}): JSX.Element {
  let [state, setState] = createStore<GameState>({
    pacMan: {
      pos: {
        x: 20.0,
        y: 20.0,
      },
      faceDir: {
        x: 1.0,
        y: 0.0,
      },
      moving: true,
      bufferedMove: undefined,
      lastChompTime: -1.0,
      dying: undefined,
    },
    ghosts: findGhosts(level),
    level: loadLevel(level),
  });
  let dijkstra = new Dijkstra({ level: untrack(() => state.level) });
  let keydownListener = (e: KeyboardEvent) => {
    if (e.key == "ArrowLeft") {
      setState("pacMan", "bufferedMove", "Left");
    } else if (e.key == "ArrowRight") {
      setState("pacMan", "bufferedMove", "Right");
    } else if (e.key == "ArrowUp") {
      setState("pacMan", "bufferedMove", "Up");
    } else if (e.key == "ArrowDown") {
      setState("pacMan", "bufferedMove", "Down");
    }
  };
  //let app = document.getElementById("app")!;
  document.addEventListener("keydown", keydownListener);
  onCleanup(() => {
    document.removeEventListener("keydown", keydownListener);
  });
  let [time, setTime] = createSignal(0.0);
  let updateTime = (t: number) => {
    setTime(t * 0.001);
    requestAnimationFrame(updateTime);
  };
  requestAnimationFrame(updateTime);
  {
    let lastTime = 0.0;
    createEffect(() => {
      let time2 = time();
      let dt = time2 - lastTime;
      untrack(() =>
        updateState({
          state,
          setState,
          dt,
          time: time(),
          dijkstra,
        }),
      );
      lastTime = time2;
    });
  }
  return <Render state={state} time={time()} pacMan={state.pacMan} />;
}

function updateState(params: {
  state: Store<GameState>;
  setState: SetStoreFunction<GameState>;
  dt: number;
  time: number;
  dijkstra: Dijkstra;
}) {
  let level = params.state.level;
  let state = params.state;
  let setState = params.setState;
  if (state.pacMan != undefined && state.pacMan.dying == undefined) {
    {
      let pos = state.pacMan.pos;
      let yIdx = Math.max(
        0,
        Math.min(level.length, Math.floor(pos.y / BLOCK_SIZE)),
      );
      let xIdx = Math.max(
        0,
        Math.min(level[yIdx].length, Math.floor(pos.x / BLOCK_SIZE)),
      );
      { // Update Dijstra algorithm for pacman position
        params.dijkstra.updateDistanceToTarget({
          target: {
            xIdx,
            yIdx,
          },
        });
      }
      let canLeft =
        pos.y % BLOCK_SIZE == 0 && level[yIdx][Math.max(0, xIdx - 1)] != "*";
      let canRight =
        pos.y % BLOCK_SIZE == 0 &&
        level[yIdx][Math.min(level[yIdx].length - 1, xIdx + 1)] != "*";
      let canUp =
        pos.x % BLOCK_SIZE == 0 && level[Math.max(0, yIdx - 1)][xIdx] != "*";
      let canDown =
        pos.x % BLOCK_SIZE == 0 &&
        level[Math.min(level.length - 1, yIdx + 1)][xIdx] != "*";
      switch (state.pacMan.bufferedMove) {
        case "Left": {
          if (canLeft) {
            setState("pacMan", "faceDir", {
              x: -1.0,
              y: 0.0,
            });
            setState("pacMan", "bufferedMove", undefined);
          }
          break;
        }
        case "Right": {
          if (canRight) {
            setState("pacMan", "faceDir", {
              x: 1.0,
              y: 0.0,
            });
            setState("pacMan", "bufferedMove", undefined);
          }
          break;
        }
        case "Up": {
          if (canUp) {
            setState("pacMan", "faceDir", {
              x: 0.0,
              y: -1.0,
            });
            setState("pacMan", "bufferedMove", undefined);
          }
          break;
        }
        case "Down": {
          if (canDown) {
            setState("pacMan", "faceDir", {
              x: 0.0,
              y: 1.0,
            });
            setState("pacMan", "bufferedMove", undefined);
          }
          break;
        }
      }
    }
    {
      // check for food
      let pos = state.pacMan.pos;
      let yIdx = Math.max(
        0,
        Math.min(
          level.length,
          Math.floor((pos.y + HALF_BLOCK_SIZE) / BLOCK_SIZE),
        ),
      );
      let xIdx = Math.max(
        0,
        Math.min(
          level[yIdx].length,
          Math.floor((pos.x + HALF_BLOCK_SIZE) / BLOCK_SIZE),
        ),
      );
      let hitFood = level[yIdx][xIdx] == ".";
      if (hitFood) {
        setState("level", yIdx, xIdx, " ");
        if (params.time - state.pacMan.lastChompTime >= 0.52) {
          sounds.playSound("Chomp");
          setState("pacMan", "lastChompTime", params.time);
        }
      }
    }
    {
      // check for ghost touch pacman
      let pacManMinX = state.pacMan.pos.x;
      let pacManMinY = state.pacMan.pos.y;
      let pacManMaxX = state.pacMan.pos.x + BLOCK_SIZE;
      let pacManMaxY = state.pacMan.pos.y + BLOCK_SIZE;
      for (let ghost of state.ghosts) {
        let ghostMinX = ghost.pos.x;
        let ghostMinY = ghost.pos.y;
        let ghostMaxX = ghost.pos.x + BLOCK_SIZE;
        let ghostMaxY = ghost.pos.y + BLOCK_SIZE;
        if (
          ghostMinX < pacManMaxX &&
          ghostMinY < pacManMaxY &&
          ghostMaxX > pacManMinX &&
          ghostMaxY > pacManMinY
        ) {
          setState("pacMan", "dying", {
            animationIdx: 0,
            animationLength: 80,
          });
          sounds.playSound("Death");
          return;
        }
      }
    }
    let pos = state.pacMan.pos;
    let faceDir = state.pacMan.faceDir;
    let newPos: { x: number; y: number } | undefined = undefined;
    if (state.pacMan.moving) {
      newPos = {
        x: pos.x + faceDir.x,
        y: pos.y + faceDir.y,
      };
    }
    if (newPos != undefined) {
      let yIdxUp = Math.max(
        0,
        Math.min(level.length - 1, Math.floor(newPos.y / BLOCK_SIZE)),
      );
      let yIdxDown = Math.max(
        0,
        Math.min(
          level.length - 1,
          Math.floor((newPos.y + BLOCK_SIZE - 1) / BLOCK_SIZE),
        ),
      );
      let xIdxLeft = Math.max(
        0,
        Math.min(level[yIdxUp].length, Math.floor(newPos.x / BLOCK_SIZE)),
      );
      let xIdxRight = Math.max(
        0,
        Math.min(
          level[yIdxUp].length,
          Math.floor((newPos.x + BLOCK_SIZE - 1) / BLOCK_SIZE),
        ),
      );
      let hitWallLeft =
        level[yIdxUp][xIdxLeft] == "*" || level[yIdxDown][xIdxLeft] == "*";
      let hitWallRight =
        level[yIdxUp][xIdxRight] == "*" || level[yIdxDown][xIdxRight] == "*";
      let hitWallUp =
        level[yIdxUp][xIdxLeft] == "*" || level[yIdxUp][xIdxRight] == "*";
      let hitWallDown =
        level[yIdxDown][xIdxLeft] == "*" || level[yIdxDown][xIdxRight] == "*";
      if (hitWallRight && faceDir.x > 0) {
        newPos.x -= newPos.x + BLOCK_SIZE - xIdxRight * BLOCK_SIZE;
      } else if (hitWallLeft && faceDir.x < 0) {
        newPos.x += xIdxLeft * BLOCK_SIZE + BLOCK_SIZE - newPos.x;
      } else if (hitWallUp && faceDir.y < 0) {
        newPos.y += yIdxUp * BLOCK_SIZE + BLOCK_SIZE - newPos.y;
      } else if (hitWallDown && faceDir.y > 0) {
        newPos.y -= newPos.y + BLOCK_SIZE - yIdxDown * BLOCK_SIZE;
      }
      if (newPos.x < -BLOCK_SIZE) {
        newPos.x += level[yIdxUp].length * BLOCK_SIZE;
      } else if (newPos.x > level[yIdxUp].length * BLOCK_SIZE) {
        newPos.x = -BLOCK_SIZE;
      }
      let newPos2 = newPos;
      batch(() => {
        setState("pacMan", "pos", newPos2);
      });
    }
    { // Ghosts
      for (let ghostIdx = 0; ghostIdx < state.ghosts.length; ++ghostIdx) {
        let ghost = state.ghosts[ghostIdx];
        let allowX = (ghost.pos.y % BLOCK_SIZE) == 0;
        let allowY = (ghost.pos.x % BLOCK_SIZE) == 0;
        if (!(allowX || allowY)) {
          continue;
        }
        let xIdx = Math.floor((ghost.pos.x + HALF_BLOCK_SIZE) / BLOCK_SIZE);
        let yIdx = Math.floor((ghost.pos.y + HALF_BLOCK_SIZE) / BLOCK_SIZE);
        let movement = params.dijkstra.getMovementTowardsTarget({
          source: {
            xIdx,
            yIdx,
          },
        });
        if (movement.x != 0 && !allowX || movement.y != 0 && !allowY) {
          movement.x = ghost.faceDir.x;
          movement.y = ghost.faceDir.y;
        }
        let newPos = {
          x: ghost.pos.x + movement.x,
          y: ghost.pos.y + movement.y,
        };
        // cancel ghost move if it will collide with another ghost
        // XXX: Disabled for now, they all get jambed when they thouch
        if (false) {
          let cancelMove = false;
          let ghostAMinX = ghost.pos.x;
          let ghostAMinY = ghost.pos.y;
          let ghostAMaxX = ghost.pos.x + BLOCK_SIZE;
          let ghostAMaxY = ghost.pos.y + BLOCK_SIZE;
          let tollerance = BLOCK_SIZE * 0.8;
          for (let i = 0; i < state.ghosts.length; ++i) {
            if (i == ghostIdx) {
              continue;
            }
            let ghostB = state.ghosts[i];
            let ghostBMinX = ghostB.pos.x;
            let ghostBMinY = ghostB.pos.y;
            let ghostBMaxX = ghostB.pos.x + BLOCK_SIZE;
            let ghostBMaxY = ghostB.pos.y + BLOCK_SIZE;
            if (
              ghostBMinX < ghostAMaxX - tollerance &&
              ghostBMinY < ghostAMaxY - tollerance &&
              ghostBMaxX > ghostAMinX + tollerance &&
              ghostBMaxY > ghostAMinY + tollerance
            ) {
              cancelMove = true;
              break;
            }
          }
          if (cancelMove) {
            continue;
          }
        }
        //
        setState("ghosts", ghostIdx, "pos", newPos);
        if (movement.x != 0 || movement.y != 0) {
          setState("ghosts", ghostIdx, "faceDir", movement);
        }
      }
    }
  }
  if (state.pacMan != undefined && state.pacMan.dying != undefined) {
    let dying = state.pacMan.dying;
    if (dying.animationIdx < dying.animationLength-1) {
      setState("pacMan", "dying", "animationIdx", (idx) => idx + 1);
    }
  }
}

function Render(props: {
  state: Store<GameState>;
  time: number;
  pacMan:
    | {
        pos: { x: number; y: number };
      }
    | undefined;
}): JSX.Element {
  return (
    <svg
      style={{
        width: "100%",
        height: "100%",
      }}
    >
      <g transform="scale(1.5)">
        <RenderLevel level={props.state.level} />
        <Show when={props.state.pacMan}>
          {(pacMan) => {
            let pacManAngle = createMemo(() => {
              let angle =
                (Math.atan2(pacMan().faceDir.y, pacMan().faceDir.x) * 180.0) /
                Math.PI;
              return angle;
            });
            let flipY = createMemo(() => {
              let ca = Math.cos((pacManAngle() * Math.PI) / 180.0);
              return ca < 0.0;
            });
            let mouthSize = createMemo(() => {
              let pacMan2 = pacMan();
              if (pacMan2.dying == undefined) {
                return 1 + 59 * Math.abs(Math.sin(props.time * 15));
              } else {
                return Math.min(1.0, (pacMan2.dying.animationIdx + 1) / (0.8 * pacMan2.dying.animationLength)) * 359.0;
              }
            });
            let deathExplode = createMemo(() => {
              let pacMan2 = pacMan();
              if (pacMan2.dying == undefined) {
                return undefined;
              }
              let t = (pacMan2.dying.animationIdx + 1) / (0.8 * pacMan2.dying.animationLength);
              if (t < 1.0) {
                return undefined;
              }
              return {
                showPop: t >= 1.0 && pacMan2.dying.animationIdx < pacMan2.dying.animationLength-1,
              };
            });
            return (
              <Switch
                fallback={
                  <RenderPacMan
                    x={pacMan().pos.x}
                    y={pacMan().pos.y}
                    angle={pacManAngle()}
                    mouthSize={mouthSize()}
                    flipY={flipY()}
                  />
                }
              >
                <Match when={deathExplode()}>
                  {(deathExplode2) => (
                    <Show when={deathExplode2().showPop}>
                      <RenderPop
                        x={pacMan().pos.x}
                        y={pacMan().pos.y}
                      />
                    </Show>
                  )}
                </Match>
              </Switch>
            );
          }}
        </Show>
        <For each={props.state.ghosts}>
          {(ghost) => (
            <RenderGhost
              x={ghost.pos.x}
              y={ghost.pos.y}
              faceDir={ghost.faceDir}
              colour={ghost.colour}
            />
          )}
        </For>
        {/*
        <RenderVerticleBlock x={10} y={10 + BLOCK_SIZE} />
        <RenderHorizontalBlock x={10 + BLOCK_SIZE} y={10} />
        <RenderTopLeftCornerBlock x={10} y={10} />
        <RenderTopRightCornerBlock x={10 + BLOCK_SIZE * 2} y={10} />
        <RenderVerticleBlock x={10 + BLOCK_SIZE * 2} y={10 + BLOCK_SIZE} />
        <RenderBottomLeftCornerBlock x={10} y={10 + BLOCK_SIZE * 2} />
        <RenderBottomRightCornerBlock
          x={10 + BLOCK_SIZE * 2}
          y={10 + BLOCK_SIZE * 2}
        />
        <RenderTDownBlock x={10 + BLOCK_SIZE * 3} y={10 + BLOCK_SIZE} />
        <RenderTUpBlock x={10 + BLOCK_SIZE * 4} y={10 + BLOCK_SIZE} />
        <RenderTRightBlock x={10 + BLOCK_SIZE * 5} y={10 + BLOCK_SIZE} />
        <RenderTLeftBlock x={10 + BLOCK_SIZE * 6} y={10 + BLOCK_SIZE} />
        <RenderCrossBlock x={10 + BLOCK_SIZE * 7} y={10 + BLOCK_SIZE} />
        */}
      </g>
    </svg>
  );
}

function RenderLevel(props: { level: Level }): JSX.Element {
  return (
    <Index each={props.level}>
      {(row, i) => {
        let y = i * BLOCK_SIZE;
        return (
          <Index each={row()}>
            {(cell, j) => {
              let renderer: Accessor<Component<{ x: number; y: number }>> =
                createMemo(() => {
                  let cell2 = cell();
                  if (cell2 == "*") {
                    let hasLeft = createMemo(() =>
                      j == 0 ? false : row()[j - 1] == "*"
                    );
                    let hasRight = createMemo(() =>
                      j == row().length - 1 ? false : row()[j + 1] == "*"
                    );
                    let hasUp = createMemo(() =>
                      i == 0 ? false : props.level[i - 1][j] == "*"
                    );
                    let hasDown = createMemo(() =>
                      i == props.level.length - 1
                        ? false
                        : props.level[i + 1][j] == "*"
                    );
                    let hasLeftUp = createMemo(() =>
                      j == 0 || i == 0
                        ? false
                        : props.level[i - 1][j - 1] == "*"
                    );
                    let hasRightUp = createMemo(() =>
                      j == row().length - 1 || i == 0
                        ? false
                        : props.level[i - 1][j + 1] == "*"
                    );
                    let hasLeftDown = createMemo(() =>
                      j == 0 || i == props.level.length - 1
                        ? false
                        : props.level[i + 1][j - 1] == "*"
                    );
                    let hasRightDown = createMemo(() =>
                      j == row().length - 1 || i == props.level.length - 1
                        ? false
                        : props.level[i + 1][j + 1] == "*"
                    );
                    return (props2) => (
                      <RenderBlock
                        x={props2.x}
                        y={props2.y}
                        hasLeft={hasLeft()}
                        hasRight={hasRight()}
                        hasUp={hasUp()}
                        hasDown={hasDown()}
                        hasLeftUp={hasLeftUp()}
                        hasRightUp={hasRightUp()}
                        hasLeftDown={hasLeftDown()}
                        hasRightDown={hasRightDown()}
                      />
                    );
                  } else if (cell2 == ".") {
                    return (props2) => <RenderFood x={props2.x} y={props2.y} />;
                  } else if (cell2 == "o") {
                    return (props2) => (
                      <RenderPowerUp x={props2.x} y={props2.y} />
                    );
                  } else if (cell2 == "-") {
                    return (props2) => (
                      <RenderHorizontalGhostWall x={props2.x} y={props2.y} />
                    );
                  }
                  return () => undefined;
                });
              let x = j * BLOCK_SIZE;
              return (
                <>
                  {renderer()({
                    x,
                    y,
                  })}
                </>
              );
            }}
          </Index>
        );
      }}
    </Index>
  );
}

function RenderBlock(props: {
  x: number;
  y: number;
  hasLeft: boolean;
  hasRight: boolean;
  hasUp: boolean;
  hasDown: boolean;
  hasLeftUp: boolean;
  hasRightUp: boolean;
  hasLeftDown: boolean;
  hasRightDown: boolean;
}): JSX.Element {
  let blockRenderer: Accessor<Component<{ x: number; y: number }>> = createMemo(
    () => {
      if (props.hasLeft) {
        if (props.hasRight) {
          if (props.hasUp) {
            if (props.hasDown) {
              //return RenderCrossBlock;
              if (!props.hasRightDown) {
                return RenderInternalTopLeftBlock;
              } else if (!props.hasLeftDown) {
                return RenderInternalTopRightBlock;
              } else if (!props.hasRightUp) {
                return RenderInternalBottomLeftBlock;
              } else {
                return RenderInternalBottomRightBlock;
              }
            } else {
              //return RenderTUpBlock;
              return RenderHorizontalBlock;
            }
          } else {
            if (props.hasDown) {
              //return RenderTDownBlock;
              return RenderHorizontalBlock;
            } else {
              return RenderHorizontalBlock;
            }
          }
        } else {
          if (props.hasUp) {
            if (props.hasDown) {
              //return RenderTLeftBlock;
              return RenderVerticleBlock;
            } else {
              return RenderBottomRightCornerBlock;
            }
          } else {
            if (props.hasDown) {
              return RenderTopRightCornerBlock;
            } else {
              return () => undefined;
            }
          }
        }
      } else {
        if (props.hasRight) {
          if (props.hasUp) {
            if (props.hasDown) {
              //return RenderTRightBlock;
              return RenderVerticleBlock;
            } else {
              return RenderBottomLeftCornerBlock;
            }
          } else {
            if (props.hasDown) {
              return RenderTopLeftCornerBlock;
            } else {
              return () => undefined;
            }
          }
        } else {
          if (props.hasUp) {
            if (props.hasDown) {
              return RenderVerticleBlock;
            } else {
              return () => undefined;
            }
          } else {
            return () => undefined;
          }
        }
      }
    },
  );
  return (
    <>
      {blockRenderer()({
        get x() {
          return props.x;
        },
        get y() {
          return props.y;
        },
      })}
    </>
  );
}

function RenderVerticleBlock(props: { x: number; y: number }): JSX.Element {
  return (
    <rect
      x={props.x + HALF_BLOCK_SIZE - 0.5 * WALL_THICKNESS}
      y={props.y}
      width={WALL_THICKNESS}
      height={BLOCK_SIZE}
      fill="blue"
    />
  );
}

function RenderHorizontalBlock(props: { x: number; y: number }): JSX.Element {
  return (
    <rect
      x={props.x}
      y={props.y + HALF_BLOCK_SIZE - 0.5 * WALL_THICKNESS}
      width={BLOCK_SIZE}
      height={WALL_THICKNESS}
      fill="blue"
    />
  );
}

function RenderTopLeftCornerBlock(props: {
  x: number;
  y: number;
}): JSX.Element {
  return (
    <path
      d={
        `M${props.x + HALF_BLOCK_SIZE} ${props.y + BLOCK_SIZE} ` +
        `A${HALF_BLOCK_SIZE} ${HALF_BLOCK_SIZE} 0 0 1 ${props.x + BLOCK_SIZE} ${props.y + HALF_BLOCK_SIZE}`
      }
      stroke="blue"
      fill="none"
      stroke-width={WALL_THICKNESS}
    />
  );
}

function RenderTopRightCornerBlock(props: {
  x: number;
  y: number;
}): JSX.Element {
  return (
    <path
      d={
        `M${props.x + HALF_BLOCK_SIZE} ${props.y + BLOCK_SIZE} ` +
        `A${HALF_BLOCK_SIZE} ${HALF_BLOCK_SIZE} 0 0 0 ${props.x} ${props.y + HALF_BLOCK_SIZE}`
      }
      stroke="blue"
      fill="none"
      stroke-width={WALL_THICKNESS}
    />
  );
}

function RenderBottomLeftCornerBlock(props: {
  x: number;
  y: number;
}): JSX.Element {
  return (
    <path
      d={
        `M${props.x + HALF_BLOCK_SIZE} ${props.y} ` +
        `A${HALF_BLOCK_SIZE} ${HALF_BLOCK_SIZE} 0 0 0 ${props.x + BLOCK_SIZE} ${props.y + HALF_BLOCK_SIZE}`
      }
      stroke="blue"
      fill="none"
      stroke-width={WALL_THICKNESS}
    />
  );
}

function RenderBottomRightCornerBlock(props: {
  x: number;
  y: number;
}): JSX.Element {
  return (
    <path
      d={
        `M${props.x} ${props.y + HALF_BLOCK_SIZE} ` +
        `A${HALF_BLOCK_SIZE} ${HALF_BLOCK_SIZE} 0 0 0 ${props.x + HALF_BLOCK_SIZE} ${props.y}`
      }
      stroke="blue"
      fill="none"
      stroke-width={WALL_THICKNESS}
    />
  );
}

function RenderTDownBlock(props: { x: number; y: number }): JSX.Element {
  return (
    <path
      d={
        `M${props.x} ${props.y + HALF_BLOCK_SIZE} ` +
        `L${props.x + BLOCK_SIZE} ${props.y + HALF_BLOCK_SIZE} ` +
        `M${props.x + HALF_BLOCK_SIZE} ${props.y + HALF_BLOCK_SIZE} ` +
        `L${props.x + HALF_BLOCK_SIZE} ${props.y + BLOCK_SIZE}`
      }
      stroke="blue"
      fill="none"
      stroke-width={WALL_THICKNESS}
    />
  );
}

function RenderTUpBlock(props: { x: number; y: number }): JSX.Element {
  return (
    <path
      d={
        `M${props.x} ${props.y + HALF_BLOCK_SIZE} ` +
        `L${props.x + BLOCK_SIZE} ${props.y + HALF_BLOCK_SIZE} ` +
        `M${props.x + HALF_BLOCK_SIZE} ${props.y + HALF_BLOCK_SIZE} ` +
        `L${props.x + HALF_BLOCK_SIZE} ${props.y}`
      }
      stroke="blue"
      fill="none"
      stroke-width={WALL_THICKNESS}
    />
  );
}

function RenderTLeftBlock(props: { x: number; y: number }): JSX.Element {
  return (
    <path
      d={
        `M${props.x + HALF_BLOCK_SIZE} ${props.y}` +
        `L${props.x + HALF_BLOCK_SIZE} ${props.y + BLOCK_SIZE} ` +
        `M${props.x + HALF_BLOCK_SIZE} ${props.y + HALF_BLOCK_SIZE} ` +
        `L${props.x} ${props.y + HALF_BLOCK_SIZE}`
      }
      stroke="blue"
      fill="none"
      stroke-width={WALL_THICKNESS}
    />
  );
}

function RenderTRightBlock(props: { x: number; y: number }): JSX.Element {
  return (
    <path
      d={
        `M${props.x + HALF_BLOCK_SIZE} ${props.y}` +
        `L${props.x + HALF_BLOCK_SIZE} ${props.y + BLOCK_SIZE} ` +
        `M${props.x + HALF_BLOCK_SIZE} ${props.y + HALF_BLOCK_SIZE} ` +
        `L${props.x + BLOCK_SIZE} ${props.y + HALF_BLOCK_SIZE}`
      }
      stroke="blue"
      fill="none"
      stroke-width={WALL_THICKNESS}
    />
  );
}

function RenderCrossBlock(props: { x: number; y: number }): JSX.Element {
  return (
    <path
      d={
        `M${props.x} ${props.y + HALF_BLOCK_SIZE} ` +
        `L${props.x + BLOCK_SIZE} ${props.y + HALF_BLOCK_SIZE} ` +
        `M${props.x + HALF_BLOCK_SIZE} ${props.y} ` +
        `L${props.x + HALF_BLOCK_SIZE} ${props.y + BLOCK_SIZE}`
      }
      stroke="blue"
      fill="none"
      stroke-width={WALL_THICKNESS}
    />
  );
}

function RenderInternalBottomLeftBlock(props: {
  x: number;
  y: number;
}): JSX.Element {
  return (
    <path
      d={
        `M${props.x + HALF_BLOCK_SIZE} ${props.y + HALF_BLOCK_SIZE} ` +
        `L${props.x + BLOCK_SIZE} ${props.y + HALF_BLOCK_SIZE} ` +
        `M${props.x + HALF_BLOCK_SIZE} ${props.y} ` +
        `L${props.x + HALF_BLOCK_SIZE} ${props.y + HALF_BLOCK_SIZE}`
      }
      stroke="blue"
      fill="none"
      stroke-width={WALL_THICKNESS}
    />
  );
}

function RenderInternalBottomRightBlock(props: {
  x: number;
  y: number;
}): JSX.Element {
  return (
    <path
      d={
        `M${props.x} ${props.y + HALF_BLOCK_SIZE} ` +
        `L${props.x + HALF_BLOCK_SIZE} ${props.y + HALF_BLOCK_SIZE} ` +
        `M${props.x + HALF_BLOCK_SIZE} ${props.y} ` +
        `L${props.x + HALF_BLOCK_SIZE} ${props.y + HALF_BLOCK_SIZE}`
      }
      stroke="blue"
      fill="none"
      stroke-width={WALL_THICKNESS}
    />
  );
}

function RenderInternalTopLeftBlock(props: {
  x: number;
  y: number;
}): JSX.Element {
  return (
    <path
      d={
        `M${props.x + HALF_BLOCK_SIZE} ${props.y + HALF_BLOCK_SIZE} ` +
        `L${props.x + BLOCK_SIZE} ${props.y + HALF_BLOCK_SIZE} ` +
        `M${props.x + HALF_BLOCK_SIZE} ${props.y + HALF_BLOCK_SIZE} ` +
        `L${props.x + HALF_BLOCK_SIZE} ${props.y + BLOCK_SIZE}`
      }
      stroke="blue"
      fill="none"
      stroke-width={WALL_THICKNESS}
    />
  );
}

function RenderInternalTopRightBlock(props: {
  x: number;
  y: number;
}): JSX.Element {
  return (
    <path
      d={
        `M${props.x} ${props.y + HALF_BLOCK_SIZE} ` +
        `L${props.x + HALF_BLOCK_SIZE} ${props.y + HALF_BLOCK_SIZE} ` +
        `M${props.x + HALF_BLOCK_SIZE} ${props.y + HALF_BLOCK_SIZE} ` +
        `L${props.x + HALF_BLOCK_SIZE} ${props.y + BLOCK_SIZE}`
      }
      stroke="blue"
      fill="none"
      stroke-width={WALL_THICKNESS}
    />
  );
}

function RenderFood(props: { x: number; y: number }): JSX.Element {
  return (
    <circle
      cx={props.x + HALF_BLOCK_SIZE}
      cy={props.y + HALF_BLOCK_SIZE}
      r={0.15 * BLOCK_SIZE}
      fill="yellow"
    />
  );
}

function RenderPowerUp(props: { x: number; y: number }): JSX.Element {
  return (
    <circle
      cx={props.x + HALF_BLOCK_SIZE}
      cy={props.y + HALF_BLOCK_SIZE}
      r={0.45 * BLOCK_SIZE}
      fill="pink"
    />
  );
}

function RenderHorizontalGhostWall(props: {
  x: number;
  y: number;
}): JSX.Element {
  return (
    <line
      x1={props.x}
      y1={props.y + BLOCK_SIZE}
      x2={props.x + BLOCK_SIZE}
      y2={props.y + BLOCK_SIZE}
      stroke="pink"
      stroke-width={WALL_THICKNESS}
    />
  );
}

function RenderPacMan(props: {
  x: number;
  y: number;
  angle: number;
  mouthSize: number; // mouth size in degrees.
  flipY: boolean;
}): JSX.Element {
  let a = createMemo(() => (0.5 * props.mouthSize * Math.PI) / 180.0);
  let eyeA = createMemo(
    () => ((0.5 * props.mouthSize + 30.0) * Math.PI) / 180.0,
  );
  let ca = createMemo(() => Math.cos(a()));
  let sa = createMemo(() => Math.sin(a()));
  let eyeCa = createMemo(() => Math.cos(eyeA()));
  let eyeSa = createMemo(() => Math.sin(eyeA()));
  let r = createMemo(() => 0.7 * BLOCK_SIZE);
  let eyeDist = createMemo(() => 0.45 * BLOCK_SIZE);
  return (
    <g
      transform={`translate(${props.x + HALF_BLOCK_SIZE} ${props.y + HALF_BLOCK_SIZE}) rotate(${props.angle})${props.flipY ? " scale(1 -1) " : ""}translate(${-(props.x + HALF_BLOCK_SIZE)} ${-(props.y + HALF_BLOCK_SIZE)})`}
    >
      <path
        d={
          `M${props.x + HALF_BLOCK_SIZE + r() * ca()} ${props.y + HALF_BLOCK_SIZE - r() * sa()} ` +
          `A${r()} ${r()} 0 ${props.mouthSize <= 180.0 ? "1" : "0"} 0 ${props.x + HALF_BLOCK_SIZE + r() * ca()} ${props.y + HALF_BLOCK_SIZE + r() * sa()} ` +
          `L${props.x + 0.5 * HALF_BLOCK_SIZE} ${props.y + HALF_BLOCK_SIZE} ` +
          `Z`
        }
        fill="yellow"
      />
      <circle
        cx={props.x + HALF_BLOCK_SIZE + eyeDist() * eyeCa()}
        cy={props.y + HALF_BLOCK_SIZE - eyeDist() * eyeSa()}
        r={0.15 * r()}
        fill="black"
      />
    </g>
  );
}

function RenderGhost(props: {
  x: number;
  y: number;
  colour: string;
  faceDir: {
    x: number;
    y: number;
  };
}): JSX.Element {
  let ghostWidth = BLOCK_SIZE;
  let ghostHeight = 1.5 * BLOCK_SIZE;
  let ghostHeadRadius = 0.5 * ghostWidth;
  let zigZagCount = 3;
  let zigZagHeight = 0.2 * ghostHeight;
  let eyeY = ghostHeight * 0.4;
  let ghostEyeWidth = ghostWidth * 0.13;
  let ghostEyeHeight = ghostWidth * 0.2;
  let eyeDotRadius = ghostEyeWidth * 0.5;
  return (
    <g
      transform={`translate(${props.x + 0.5 * BLOCK_SIZE - 0.5 * ghostWidth} ${props.y + 0.5 * BLOCK_SIZE - 0.5 * ghostHeight})`}
    >
      <path
        d={
          `M${ghostWidth} ${ghostHeight} ` +
          `l0 ${-(ghostHeight - ghostHeadRadius)} ` +
          `A${ghostHeadRadius} ${ghostHeadRadius} 0 0 0 0 ${ghostHeadRadius} ` +
          `l0 ${ghostHeight - ghostHeadRadius} ` +
          new Array(zigZagCount)
            .fill(undefined)
            .map((_, idx) => {
              let x1 = ((idx * 2 + 1) * ghostWidth) / (zigZagCount * 2);
              let x2 = ((idx * 2 + 2) * ghostWidth) / (zigZagCount * 2);
              return (
                `L${x1} ${ghostHeight - zigZagHeight} ` +
                `L${x2} ${ghostHeight}`
              );
            })
            .join(" ")
        }
        fill={props.colour}
        stroke="none"
      />
      <For each={[0.3 * ghostWidth, 0.7 * ghostWidth]}>
        {(eyeX) => {
          return (
            <>
              <ellipse
                cx={eyeX}
                cy={eyeY}
                rx={ghostEyeWidth}
                ry={ghostEyeHeight}
                fill="white"
                stroke="black"
                stroke-width="0.5"
              />
              <circle
                cx={eyeX + 0.5 * props.faceDir.x * (ghostEyeWidth - eyeDotRadius)}
                cy={eyeY + 0.5 * props.faceDir.y * (ghostEyeHeight - eyeDotRadius)}
                r={eyeDotRadius}
                stroke="none"
                fill="black"
              />
            </>
          );
        }}
      </For>
    </g>
  );
}

function RenderPop(props: { x: number, y: number }): JSX.Element {
  let parts: { v1x: number, v1y: number, v2x: number, v2y: number, }[] = [];
  let numParts = 8;
  let a = 0;
  let stepA = 2.0 * Math.PI / numParts;
  let r1 = 0.3 * BLOCK_SIZE;
  let r2 = 0.8 * BLOCK_SIZE;
  for (let i = 0; i < numParts; ++i, a += stepA) {
    let ca = Math.cos(a);
    let sa = Math.sin(a);
    parts.push({
      v1x: ca * r1,
      v1y: sa * r1,
      v2x: ca * r2,
      v2y: sa * r2,
    });
  }
  return (
    <g transform={`translate(${props.x + HALF_BLOCK_SIZE} ${props.y + HALF_BLOCK_SIZE})`}>
      <For each={parts}>
        {(part) => (
          <line
            x1={part.v1x}
            y1={part.v1y}
            x2={part.v2x}
            y2={part.v2y}
            stroke="yellow"
            stroke-width={WALL_THICKNESS}
          />
        )}
      </For>
    </g>
  );
}