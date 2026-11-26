// vibration-analysis.js:worseLevel
import { LEVELS, type Level } from "./texts";
export const worseLevel = (a: Level, b: Level): Level => (LEVELS[b].rank > LEVELS[a].rank ? b : a);
