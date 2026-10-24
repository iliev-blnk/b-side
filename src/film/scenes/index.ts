import type { SceneName } from "../story.ts";
import type { Scene } from "./kit.ts";
import { view } from "./kit.ts";
import { clubScene } from "./club.ts";
import { insertScene, windowScene } from "./rooms.ts";
import { bridgeScene, roofScene, skylineScene, tramScene } from "./city.ts";
import { recordScene } from "./finale.ts";
import { platformScene } from "./station.ts";
import { lampScene, walkScene } from "./street.ts";
import { H, W } from "../stage.ts";

/** Between the acts: a sheet in the record's colour, for the next title to be set on. */
const card: Scene = () => () =>
  view([{ id: "card", z: 1, fixed: true, pieces: [{ id: "card/sheet", kind: "rect", ink: "label", x: -20, y: -20, w: W + 40, h: H + 40, edge: 0.3 }] }], { x: 0, y: 0, d: 0, zoom: 1, focus: 1 });

export const SCENES: Record<SceneName, Scene> = {
  skyline: skylineScene,
  lamp: lampScene,
  walk: walkScene,
  insert: insertScene,
  tram: tramScene,
  club: clubScene,
  window: windowScene,
  roof: roofScene,
  bridge: bridgeScene,
  platform: platformScene,
  record: recordScene,
  card,
};
