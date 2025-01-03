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
  onMount,
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
const INTRO_MUSIC_WAIT_TIME = 4.5;
const GHOST_SCARED_TIME = 3.0;
const GHOST_SCARED_SKIP_MOVE_EVERY = 1;
const TARGET_FRAME_RATE = 60;
const TARGET_TIME_STEP = 1.0 / TARGET_FRAME_RATE;

function throttleUpdate(params: {
  dtOffset: number,
  dt: number,
  updateFn: () => void,
}): {
  dtOffset: number,
} {
  return batch(() => {
    let dt2 = params.dtOffset + params.dt;
    while (dt2 > 0.0) {
      params.updateFn();
      dt2 -= TARGET_TIME_STEP;
    }
    return {
      dtOffset: dt2,
    };
  });
}

let sounds = await Sounds.load();
console.log(sounds);

type Level = string[][];

function loadLevel(data: string[]): Level {
  return data.map((x) =>
    new Array(x.length).fill(undefined).map((_, idx) => x.charAt(idx)),
  );
}

function findGhosts(level: Level): GameState["ghosts"] {
  let result: GameState["ghosts"] = [];
  let atY = 0;
  for (let i = 0; i < level.length; ++i, atY += BLOCK_SIZE) {
    let row = level[i];
    let atX = 0;
    for (let j = 0; j < row.length; ++j, atX += BLOCK_SIZE) {
      let cell = row[j];
      if (cell == "G") {
        let homeMap = new Dijkstra({ level, });
        homeMap.updateDistanceToTarget({
          target: { xIdx: j, yIdx: i, },
        });
        result.push({
          homePos: { xIdx: j, yIdx: i, },
          homeMap,
          pos: { x: atX, y: atY, },
          faceDir: { x: 0, y: -1, },
          colour: genGhostColour(),
          died: false,
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
  playingIntroMusic: boolean,
  playingIntroMusicStartTime: number,
  playing: boolean,
  firstPlay: boolean,
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
    homePos: { xIdx: number, yIdx: number, },
    homeMap: Dijkstra,
    pos: { x: number, y: number, },
    faceDir: { x: number, y: number, },
    colour: string,
    died: boolean,
  }[];
  ghostsScared: {
    startTime: number,
    ticksForSlowness: number,
  } | undefined,
  level: Level;
};

function makeInitGameState(params: { firstPlay: boolean, }): GameState {
  let level2 = loadLevel(level);
  return {
    playingIntroMusic: false,
    playingIntroMusicStartTime: 0.0,
    playing: false,
    firstPlay: params.firstPlay,
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
    ghosts: findGhosts(level2),
    ghostsScared: undefined,
    level: level2,
  };
}

function Game(props: {}): JSX.Element {
  let [state, setState] = createStore<GameState>(makeInitGameState({
    firstPlay: true,
  }));
  let dijkstra = new Dijkstra({ level: untrack(() => state.level) });
  let onAnyKey = () => {
    if (!state.firstPlay && !state.playing && !state.playingIntroMusic) {
      setState("playingIntroMusic", true);
      setState("playingIntroMusicStartTime", time());
      sounds.playSound("Intro");
    }
  };
  let onLeftPressed = () => {
    onAnyKey();
    setState("pacMan", "bufferedMove", "Left");
  };
  let onRightPressed = () => {
    onAnyKey();
    setState("pacMan", "bufferedMove", "Right");
  };
  let onUpPressed = () => {
    onAnyKey();
    setState("pacMan", "bufferedMove", "Up");
  };
  let onDownPressed = () => {
    onAnyKey();
    setState("pacMan", "bufferedMove", "Down");
  };
  let keydownListener = (e: KeyboardEvent) => {
    onAnyKey();
    if (e.key == "ArrowLeft") {
      onLeftPressed();
    } else if (e.key == "ArrowRight") {
      onRightPressed();
    } else if (e.key == "ArrowUp") {
      onUpPressed();
    } else if (e.key == "ArrowDown") {
      onDownPressed();
    }
  };
  //let app = document.getElementById("app")!;
  document.addEventListener("keydown", keydownListener);
  onCleanup(() => {
    document.removeEventListener("keydown", keydownListener);
  });
  let pointerDownListener = (e: PointerEvent) => {
    if (state.firstPlay && !state.playing && !state.playingIntroMusic) {
      setState("playingIntroMusic", true);
      setState("playingIntroMusicStartTime", time());
      sounds.playSound("Intro");
    }
  };
  document.addEventListener("pointerdown", pointerDownListener);
  onCleanup(() => {
    document.removeEventListener("pointerdown", pointerDownListener);
  });
  let [time, setTime] = createSignal(0.0);
  let updateTime = (t: number) => {
    setTime(t * 0.001);
    requestAnimationFrame(updateTime);
  };
  requestAnimationFrame(updateTime);
  {
    let lastTime = 0.0;
    let dtOffset = 0.0;
    createEffect(() => {
      let time2 = time();
      let dt = time2 - lastTime;
      let { dtOffset: nextDtOffset } = untrack((): { dtOffset: number, } =>
        throttleUpdate({
          dtOffset,
          dt,
          updateFn: () => updateState({
            state,
            setState,
            dt,
            time: time(),
            dijkstra,
          })
        }),
      );
      dtOffset = nextDtOffset;
      lastTime = time2;
    });
  }
  return (
    <Render
      state={state}
      time={time()}
      pacMan={state.pacMan}
      onUpPressed={onUpPressed}
      onDownPressed={onDownPressed}
      onLeftPressed={onLeftPressed}
      onRightPressed={onRightPressed}
    />
  );
}

function updateState(params: {
  state: Store<GameState>;
  setState: SetStoreFunction<GameState>;
  dt: number;
  time: number;
  dijkstra: Dijkstra;
}) {
  let state = params.state;
  let setState = params.setState;
  if (!params.state.playing) {
    if (params.state.playingIntroMusic) {
      if (params.time - params.state.playingIntroMusicStartTime >= INTRO_MUSIC_WAIT_TIME) {
        setState("playingIntroMusic", false);
        setState("playing", true);
      }
    }
    return;
  }
  let level = params.state.level;
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
      let hitPowerUp = level[yIdx][xIdx] == "o";
      if (hitFood) {
        setState("level", yIdx, xIdx, " ");
        if (params.time - state.pacMan.lastChompTime >= 0.52) {
          sounds.playSound("Chomp");
          setState("pacMan", "lastChompTime", params.time);
        }
      } else if (hitPowerUp) {
        setState("level", yIdx, xIdx, " ");
        sounds.playSound("Fruit");
        setState("ghostsScared", {
          startTime: params.time,
          ticksForSlowness: 0,
        });
      }
    }
    {
      // check for ghost touch pacman
      let pacManMinX = state.pacMan.pos.x;
      let pacManMinY = state.pacMan.pos.y;
      let pacManMaxX = state.pacMan.pos.x + BLOCK_SIZE;
      let pacManMaxY = state.pacMan.pos.y + BLOCK_SIZE;
      let playedEatGhostSound = false;
      for (let ghostIdx = 0; ghostIdx < state.ghosts.length; ++ghostIdx) {
        let ghost = state.ghosts[ghostIdx];
        if (ghost.died) {
          continue;
        }
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
          if (state.ghostsScared) {
            setState("ghosts", ghostIdx, "died", true);
            if (!playedEatGhostSound) {
              sounds.playSound("Ghost");
              playedEatGhostSound = true;
            }
          } else {
            setState("pacMan", "dying", {
              animationIdx: 0,
              animationLength: 80,
            });
            sounds.playSound("Death");
            return;
          }
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
      let movementFn: (params: {
        source: {
          xIdx: number,
          yIdx: number,
        }
      }) => {
        x: number,
        y: number,
      };
      let skipMoveIfAlive = false;
      if (state.ghostsScared == undefined) {
        movementFn = params.dijkstra.getMovementTowardsTarget.bind(params.dijkstra);
      } else {
        if (state.ghostsScared.ticksForSlowness == GHOST_SCARED_SKIP_MOVE_EVERY) {
          skipMoveIfAlive = true;
          setState("ghostsScared", "ticksForSlowness", 0);
        } else {
          setState("ghostsScared", "ticksForSlowness", (x) => x + 1);
        }
        movementFn = params.dijkstra.getMovementAwayFromTarget.bind(params.dijkstra);
        if (params.time - state.ghostsScared.startTime >= GHOST_SCARED_TIME) {
          setState("ghostsScared", undefined);
        }
      }
      for (let ghostIdx = 0; ghostIdx < state.ghosts.length; ++ghostIdx) {
        let ghost = state.ghosts[ghostIdx];
        let movementFn2: typeof movementFn;
        if (ghost.died) {
          movementFn2 = ghost.homeMap.getMovementTowardsTarget.bind(ghost.homeMap);
        } else {
          if (skipMoveIfAlive) {
            continue;
          }
          movementFn2 = movementFn;
        }
        let allowX = (ghost.pos.y % BLOCK_SIZE) == 0;
        let allowY = (ghost.pos.x % BLOCK_SIZE) == 0;
        if (!(allowX || allowY)) {
          continue;
        }
        let xIdx = Math.floor((ghost.pos.x + HALF_BLOCK_SIZE) / BLOCK_SIZE);
        let yIdx = Math.floor((ghost.pos.y + HALF_BLOCK_SIZE) / BLOCK_SIZE);
        if (ghost.died) {
          if (xIdx == ghost.homePos.xIdx && yIdx == ghost.homePos.yIdx) {
            setState("ghosts", ghostIdx, "died", false);
          }
        }
        let movement = movementFn2({
          source: {
            xIdx,
            yIdx,
          },
        });
        if (movement.x != 0 && !allowX || movement.y != 0 && !allowY) {
          movement.x = ghost.faceDir.x;
          movement.y = ghost.faceDir.y;
        }
        if (ghost.died) {
          movement.x = (movement.x & 1) == 1 ? movement.x : 2 * movement.x;
          movement.y = (movement.y & 1) == 1 ? movement.y : 2 * movement.y;
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
    } else {
      setState(makeInitGameState({
        firstPlay: false,
      }));
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
  onUpPressed: () => void,
  onDownPressed: () => void,
  onLeftPressed: () => void,
  onRightPressed: () => void,
}): JSX.Element {
  let [ svgElement, setSvgElement, ] = createSignal<SVGSVGElement>();
  let [ svgSize, setSvgSize, ] = createSignal<{ width: number, height: number }>();
  onMount(() => {
    let svg = svgElement();
    if (svg == undefined) {
      return undefined;
    }
    let box = svg.getBoundingClientRect();
    setSvgSize({
      width: box.width,
      height: box.height,
    });
  });
  let panScale = createMemo(() => {
    let svgSize2 = svgSize();
    if (svgSize2 == undefined) {
      return undefined;
    }
    let mapWidth = 0;
    for (let row of props.state.level) {
      let width = row.length * BLOCK_SIZE;
      if (width > mapWidth) {
        mapWidth = width;
      }
    }
    if (mapWidth == 0) {
      return undefined;
    }
    let mapHeight = props.state.level.length * BLOCK_SIZE;
    let scale = Math.min(svgSize2.width / mapWidth, svgSize2.height / mapHeight);
    let offsetX = 0.5 * (svgSize2.width / scale - mapWidth);
    let offsetY = 0.5 * (svgSize2.height / scale - mapHeight);
    return {
      pan: {
        x: offsetX,
        y: offsetY,
      },
      scale,
    };
  });
  let pan = () => panScale()?.pan;
  let scale = () => panScale()?.scale;
  return (
    <div
      style={{
        "display": "flex",
        "flex-direction": "row",
        "position": "relative",
        "width": "100%",
        "height": "100%",
      }}
    >
      <svg
        ref={setSvgElement}
        style={{
          "flex-grow": "1",
        }}
      >
        <g transform={`scale(${scale() ?? 1.0}) translate(${pan()?.x ?? 0.0} ${pan()?.y ?? 0.0})`}>
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
                scared={props.state.ghostsScared != undefined}
                died={ghost.died}
              />
            )}
          </For>
          <Show when={!props.state.playingIntroMusic && !props.state.playing}>\
            <text
              x={0.5 * (props.state.level?.[0]?.length ?? 0) * BLOCK_SIZE}
              y="125"
              text-anchor="middle"
              font-weight="bold"
              stroke="black"
              stroke-width="0.5"
              fill="red"
            >
              <Switch
                fallback={
                  <>Press any key to start!</>
                }
              >
                <Match when={props.state.firstPlay}>
                  Click/tounch to start!
                </Match>
              </Switch>
            </text>
          </Show>
          <Show when={props.state.playingIntroMusic}>
            <text
              x={0.5 * (props.state.level?.[0]?.length ?? 0) * BLOCK_SIZE}
              y="125"
              text-anchor="middle"
              font-weight="bold"
              stroke="black"
              stroke-width="0.5"
              fill="red"
            >
              {(() => {
                let countDown = createMemo(() => {
                  let countFrom = 5;
                  let r = ((props.time + 0.2) - props.state.playingIntroMusicStartTime) / INTRO_MUSIC_WAIT_TIME;
                  if (r >= 1.0) {
                    return "GO";
                  }
                  return Math.ceil(5 - countFrom * r);
                });
                return (<>{countDown()}</>);
              })()}
            </text>
          </Show>
        </g>
      </svg>
      <RenderTouchControls
        onUpPressed={props.onUpPressed}
        onDownPressed={props.onDownPressed}
        onLeftPressed={props.onLeftPressed}
        onRightPressed={props.onRightPressed}
      />
    </div>
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
  scared: boolean,
  died: boolean,
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
      <Show when={!props.died}>
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
          fill={props.scared ? "blue" : props.colour}
          stroke={props.scared ? "white" : "none"}
          stroke-width={WALL_THICKNESS / 2}
        />
      </Show>
      <For each={[0.3 * ghostWidth, 0.7 * ghostWidth]}>
        {(eyeX) => {
          return (
            <>
              <ellipse
                cx={eyeX}
                cy={eyeY}
                rx={ghostEyeWidth}
                ry={ghostEyeHeight}
                fill={props.scared ? "black" : "white"}
                stroke={props.scared ? "white" : "black"}
                stroke-width="0.5"
              />
              <circle
                cx={eyeX + 0.5 * props.faceDir.x * (ghostEyeWidth - eyeDotRadius)}
                cy={eyeY + 0.5 * props.faceDir.y * (ghostEyeHeight - eyeDotRadius)}
                r={eyeDotRadius}
                stroke="none"
                fill={props.scared ? "white" : "black"}
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

function RenderTouchControls(props: {
  onUpPressed: () => void,
  onDownPressed: () => void,
  onLeftPressed: () => void,
  onRightPressed: () => void,
}): JSX.Element {
  let minOfWH = Math.min(window.innerWidth, window.innerHeight);
  let buttonStyle: string | JSX.CSSProperties = {
    "background-color": "grey",
    "border": "2px lightgrey solid",
    "width": `${minOfWH * 0.12}px`,
    "height": `${minOfWH * 0.12}px`,
    "font-size": `${minOfWH * 0.08}px`,
    "text-align": "center",
    "cursor": "pointer",
    "user-select": "none",
  };
  return (
    <div style={{
      "display": "grid",
      "grid-template-columns": "auto auto auto",
      "position": "absolute",
      "right": `${minOfWH * 0.12}px`,
      "bottom": `${minOfWH * 0.12}px`,
    }}>
      <div></div>
      <div
        onpointerdown={() => props.onUpPressed()}
        style={buttonStyle}
      >
        {"\u25B2"}
      </div>
      <div></div>
      <div
        onpointerdown={() => props.onLeftPressed()}
        style={buttonStyle}
      >
        {"\u25C0"}
      </div>
      <div></div>
      <div
        onpointerdown={() => props.onRightPressed()}
        style={buttonStyle}
      >
        {"\u25B6"}
      </div>
      <div></div>
      <div
        onpointerdown={() => props.onDownPressed()}
        style={buttonStyle}
      >
        {"\u25BC"}
      </div>
    </div>
  );
}