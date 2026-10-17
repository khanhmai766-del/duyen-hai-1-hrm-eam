"use client";

import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { createFlowParticles, flowPointScale, FLOW_FRAME_MS, webgl2Supported, type FlowParticles } from "@/components/soot-blowers/three-flow";
import type { BlowerStatus } from "@/components/soot-blowers/Boiler3D";

/* Mô hình 3D GGH (gas-gas heater — bộ sấy khói kiểu quay của FGD) cho tab GGH của sơ đồ vòi thổi bụi (17/10/2026).
   Dựng thủ tục theo khung hình video minh hoạ bộ sấy quay (rô-to, vách ngăn hướng tâm, chụp trên/dưới, cụm truyền
   động giữa, cần vòi phun lên mặt rô-to) — kích thước TƯƠNG ĐỐI, chưa theo bản vẽ DH1: chỉnh các hằng số ở dưới.
   Hai vòi thật trong cây "Bộ GGH": GGH-TREN (vòi thổi bụi trên, x0HTB10AA001), GGH-DUOI (vòi dưới, x0HTB10AA002).
   Hoạt ảnh: rô-to quay; cần vòi chạy từ vòng trong ra vòng ngoài, mỗi vòng quay tiến chưa tới bề rộng tia → vệt quét
   xoắn ốc; mặt rô-to tính trong shader từ toạ độ cực (đã quét = sạch, chưa quét = bám tro), hết hành trình thì bẩn lại
   rồi lặp; tia hơi (trắng) hoặc nước cao áp (xanh); khói thô nóng đi XUỐNG nửa phía khói thô, khói sạch sau tháp hấp
   thụ đi LÊN nửa kia. Hạt + vòng vẽ theo cách đã tối ưu ở Boiler3D (GPU, ~30 khung/giây khi đứng yên, nhãn chỉ vẽ lại
   khi cảnh đổi, dừng khi khung ra khỏi màn hình). Rô-to 0,64 vòng/phút (quy định khi thổi bụi / rửa nước), chạy đúng thời gian thật. */

/* ---- kích thước (m, tương đối) ---- */
const R = 6; // bán kính rô-to
const H = 2.4; // chiều cao rô-to
const HUB = 0.9; // bán kính trục giữa
const CASE = R + 0.7; // trung đoạn vỏ bát giác
const HOOD_H = 2.9; // chiều cao chụp (phễu) trên/dưới
const DUCT_H = 2.2; // ống chữ nhật nối chụp
const PLATE_W = 1.6; // bề rộng tấm quạt (sector plate) chia hai nửa
const DIAPHRAGMS = 24;
/* ---- hoạt ảnh ---- */
// Tốc độ rô-to quy định khi thổi bụi / rửa nước: 0,64 vòng/phút (người dùng chốt 17/10/2026) → ~93,75 giây/vòng.
// Mọi thời gian dưới đây là giây THẬT — mô phỏng chạy đúng một tốc độ, không tua nhanh (người dùng chốt 17/10/2026).
export const GGH_RPM = 0.64;
const SPIN_PERIOD = 60 / GGH_RPM;
const OMEGA = (Math.PI * 2) / SPIN_PERIOD;
const JET_W = 0.6; // nửa bề rộng vệt tia trên mặt rô-to
const R0 = HUB + 0.35; // bán kính bắt đầu quét
// cần vòi tiến 90% bề rộng vệt mỗi vòng quay → vệt xoắn ốc chồng mép, không sót vòng; số vòng làm tròn lên
const STROKE = Math.ceil((R - R0) / (2 * JET_W * 0.9)) * SPIN_PERIOD; // ≈ 5 vòng ≈ 7,8 phút
const HOLD = 30; // giữ sạch
const RESOIL = 40; // bẩn lại (minh hoạ chu kỳ sau)
const CYCLE = STROKE + HOLD + RESOIL;
const LANCE_SPEED = (R - R0) / STROKE;
// Hai cần vòi CÙNG một phương (vòi trên ngay phía trên vòi dưới) như thực tế — người dùng chỉ 17/10/2026.
/** Mặt hộp dẫn động cần vòi (bán kính) — thân cần chạy từ đây vào tới đầu phun. Đặt ra ngoài góc chụp phễu
    (góc hình chữ nhật đáy chụp ở bán kính CASE·√2 ≈ 9,5) để hộp không cấn mép thành GGH (17/10/2026). */
const LANCE_MOUNT = R + 4.3;
const BOT_ANGLE = 2.4 + Math.PI; // góc đặt cần vòi (rad, trên mặt bằng)
const TOP_ANGLE = BOT_ANGLE;

export type GghView = "overview" | "top" | "side";
const VIEW_LABEL: Record<GghView, string> = { overview: "Toàn cảnh", top: "Trên", side: "Cạnh" };
const TARGET = new THREE.Vector3(0, 0.6, 0);
const VIEW_POS: Record<GghView, [number, number, number]> = { overview: [33, 23, 38], top: [0.6, 58, 1.2], side: [50, 4, 6] };
const STATUS_COLOR: Record<BlowerStatus, number> = { OK: 0x16a34a, WARN: 0xfacc15, BAD: 0xf97316 };
const SELECT_COLOR = 0x1d4ed8;
const LABEL_CLASS: Record<BlowerStatus | "SEL", string> = {
  SEL: "bg-blue-700 text-white",
  BAD: "bg-orange-500 text-white",
  WARN: "bg-yellow-300 text-slate-900",
  OK: "bg-green-600 text-white",
};
export const GGH_TAGS = ["GGH-TREN", "GGH-DUOI"] as const;
type GghTag = (typeof GGH_TAGS)[number];
export type GghMode = "steam" | "water";

/* ---- trạng thái hành trình cần vòi tại thời điểm t (dùng chung CPU + uniform shader) ---- */
function lanceState(t: number) {
  const c = ((t % CYCLE) + CYCLE) % CYCLE;
  if (c < STROKE) return { s: c, r: R0 + LANCE_SPEED * c, soil: 0, jet: true };
  if (c < STROKE + HOLD) return { s: STROKE, r: R + JET_W * 2, soil: 0, jet: false };
  return { s: STROKE, r: R + JET_W * 2, soil: (c - STROKE - HOLD) / RESOIL, jet: false };
}

/* Mặt rô-to: giỏ phần tử tổ ong + vách hướng tâm + vòng đồng tâm; bám tro (tối) → sạch (vàng giỏ) theo vệt cần vòi.
   vLocal = toạ độ trong hệ rô-to (hình học dựng sẵn trong hệ đó), nên quay rô-to không phải tính lại. */
const FACE_VERTEX = /* glsl */ `
  varying vec3 vLocal;
  void main() { vLocal = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FACE_FRAGMENT = /* glsl */ `
  uniform float uR, uHub, uR0, uW, uV, uOmega, uS, uRl, uThetaNow, uSoil, uJet;
  uniform vec3 uJetColor;
  varying vec3 vLocal;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float hexEdge(vec2 p) {
    // khoảng cách tới cạnh ô lục giác (lưới tổ ong)
    vec2 r = vec2(1.0, 1.7320508);
    vec2 h = r * 0.5;
    vec2 a = mod(p, r) - h;
    vec2 b = mod(p - h, r) - h;
    vec2 g = dot(a, a) < dot(b, b) ? a : b;
    g = abs(g);
    return 0.5 - max(dot(g, normalize(vec2(1.0, 1.7320508))), g.x);
  }
  void main() {
    float r = length(vLocal.xz);
    float th = atan(vLocal.z, vLocal.x);
    // đã quét trong hành trình hiện tại?
    float clean = 0.0;
    if (r < uRl - uW) clean = 1.0;
    else if (r < uRl + uW) {
      float tEnter = (r - uW - uR0) / uV;
      float swept = uOmega * (uS - tEnter);
      float d = mod(uThetaNow - th, 6.2831853);
      clean = d < swept ? 1.0 : 0.0;
    }
    float dirt = max(1.0 - clean, uSoil);
    float n = hash(floor(vLocal.xz * 3.0));
    vec3 basket = vec3(0.86, 0.68, 0.38) * (0.9 + 0.1 * n);
    vec3 ash = vec3(0.24, 0.22, 0.2) * (0.75 + 0.5 * n);
    vec3 col = mix(basket, ash, dirt);
    // lưới tổ ong mảnh
    float e = hexEdge(vLocal.xz * 4.5);
    col *= mix(0.62, 1.0, smoothstep(0.0, 0.07, e));
    // vách ngăn hướng tâm + vòng đồng tâm + mép (màu thép xanh)
    float seg = 6.2831853 / ${DIAPHRAGMS}.0;
    float radial = abs(mod(th + seg * 0.5, seg) - seg * 0.5) * r;
    float ring = min(abs(r - uR * 0.42), abs(r - uR * 0.72));
    float rim = min(abs(r - uR), abs(r - uHub));
    float line = min(min(radial, ring), rim);
    col = mix(vec3(0.12, 0.42, 0.45), col, smoothstep(0.03, 0.08, line));
    // điểm tia đang phun: quầng sáng tại (uRl, uThetaNow)
    if (uJet > 0.5) {
      vec2 tip = uRl * vec2(cos(uThetaNow), sin(uThetaNow));
      float g = exp(-dot(vLocal.xz - tip, vLocal.xz - tip) / (uW * uW * 0.6));
      col = mix(col, uJetColor, g * 0.85);
    }
    gl_FragColor = vec4(col, 1.0);
  }`;

function pill(text: string, cls: string) {
  const el = document.createElement("span");
  el.textContent = text;
  el.className = `pointer-events-none whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-bold ${cls}`;
  return el;
}

/** Thân phễu 4 mặt (không nắp) nối hình chữ nhật đáy (y0) với hình chữ nhật đỉnh (y1); rect = [xMin, xMax, zMin, zMax]. */
function frustum(b: [number, number, number, number], y0: number, t: [number, number, number, number], y1: number) {
  const v = (r: number[], y: number) => [[r[0], y, r[2]], [r[1], y, r[2]], [r[1], y, r[3]], [r[0], y, r[3]]];
  const lo = v(b, y0), hi = v(t, y1);
  const pos: number[] = [];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    pos.push(...lo[i], ...lo[j], ...hi[j], ...lo[i], ...hi[j], ...hi[i]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}

type Scene = {
  paint: (statuses: Record<string, BlowerStatus>, selected: string | null) => void;
  fly: (view: GghView) => void;
  setShowTags: (on: boolean) => void;
  setFlow: (on: boolean) => void;
  setMode: (mode: GghMode) => void;
};

function createScene(host: HTMLDivElement, onPick: (tag: string) => void): { api: Scene; dispose: () => void } {
  const width = () => Math.max(host.clientWidth, 1);
  const height = () => Math.max(host.clientHeight, 1);
  const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, coarse ? 1.5 : 2));
  renderer.setSize(width(), height());
  renderer.domElement.style.touchAction = "none";
  host.appendChild(renderer.domElement);
  const labels = new CSS2DRenderer();
  labels.setSize(width(), height());
  Object.assign(labels.domElement.style, { position: "absolute", inset: "0", pointerEvents: "none" });
  host.appendChild(labels.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xe8ecf1);
  scene.add(new THREE.AmbientLight(0xffffff, 0.9));
  const sun = new THREE.DirectionalLight(0xffffff, 1.1);
  sun.position.set(18, 30, 22);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(30, width() / height(), 1, 400);
  camera.position.set(...VIEW_POS.overview);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(TARGET);
  Object.assign(controls, { enableDamping: true, dampingFactor: 0.12, enablePan: false, rotateSpeed: 0.9, minDistance: 18, maxDistance: 130, zoomSpeed: 0.8 });
  controls.update();

  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(x: T) => (disposables.push(x), x);
  const steel = track(new THREE.MeshStandardMaterial({ color: 0x24406f, metalness: 0.2, roughness: 0.7 }));
  const steelDark = track(new THREE.MeshStandardMaterial({ color: 0x1b2f52, metalness: 0.2, roughness: 0.7 }));
  const glass = (color: number, opacity: number) =>
    track(new THREE.MeshStandardMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false }));
  const edgeMat = track(new THREE.LineBasicMaterial({ color: 0x1e293b }));
  const addWithEdges = (geo: THREE.BufferGeometry, mat: THREE.Material) => {
    track(geo);
    const mesh = new THREE.Mesh(geo, mat);
    scene.add(mesh);
    scene.add(new THREE.LineSegments(track(new THREE.EdgesGeometry(geo, 25)), edgeMat));
    return mesh;
  };

  /* ---- rô-to (quay) ---- */
  const rotor = new THREE.Group();
  scene.add(rotor);
  const shell = new THREE.Mesh(track(new THREE.CylinderGeometry(R, R, H, 72, 1, true)), glass(0x1f6f78, 0.38));
  rotor.add(shell);
  rotor.add(new THREE.Mesh(track(new THREE.CylinderGeometry(HUB, HUB, H + 0.3, 32)), steelDark));
  // vách ngăn hướng tâm
  const plateGeo = track(new THREE.BoxGeometry(R - HUB, H, 0.06));
  const plates = new THREE.InstancedMesh(plateGeo, glass(0x1f6f78, 0.3), DIAPHRAGMS);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < DIAPHRAGMS; i++) {
    const a = (i / DIAPHRAGMS) * Math.PI * 2;
    const mid = (R + HUB) / 2;
    m4.compose(new THREE.Vector3(Math.cos(a) * mid, 0, Math.sin(a) * mid), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a), new THREE.Vector3(1, 1, 1));
    plates.setMatrixAt(i, m4);
  }
  rotor.add(plates);
  // hai mặt rô-to: shader bẩn → sạch, mỗi mặt theo cần vòi của nó
  const faceMat = (angle: number) =>
    track(new THREE.ShaderMaterial({
      vertexShader: FACE_VERTEX,
      fragmentShader: FACE_FRAGMENT,
      uniforms: {
        uR: { value: R }, uHub: { value: HUB }, uR0: { value: R0 }, uW: { value: JET_W }, uV: { value: LANCE_SPEED }, uOmega: { value: OMEGA },
        uS: { value: 0 }, uRl: { value: R0 }, uThetaNow: { value: angle }, uSoil: { value: 0 }, uJet: { value: 1 }, uJetColor: { value: new THREE.Color(1, 1, 1) },
      },
    }));
  const topFaceMat = faceMat(TOP_ANGLE);
  const botFaceMat = faceMat(BOT_ANGLE);
  const topFace = new THREE.Mesh(track(new THREE.RingGeometry(HUB, R, 96, 1).rotateX(-Math.PI / 2).translate(0, H / 2 + 0.01, 0)), topFaceMat);
  const botFace = new THREE.Mesh(track(new THREE.RingGeometry(HUB, R, 96, 1).rotateX(Math.PI / 2).translate(0, -H / 2 - 0.01, 0)), botFaceMat);
  rotor.add(topFace, botFace);

  /* ---- vỏ bát giác + tấm quạt + chụp + ống ---- */
  const oct = new THREE.Shape();
  const octR = CASE / Math.cos(Math.PI / 8);
  for (let i = 0; i <= 8; i++) {
    const a = Math.PI / 8 + (i / 8) * Math.PI * 2;
    if (i === 0) oct.moveTo(Math.cos(a) * octR, Math.sin(a) * octR); else oct.lineTo(Math.cos(a) * octR, Math.sin(a) * octR);
  }
  const caseGeo = new THREE.ExtrudeGeometry(oct, { depth: H + 1, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, -(H + 1) / 2, 0);
  addWithEdges(caseGeo, glass(0x2b4a7a, 0.16));
  for (const y of [H / 2 + 0.5, -H / 2 - 0.5]) {
    const plate = new THREE.Mesh(track(new THREE.BoxGeometry(2 * CASE, 0.14, PLATE_W)), steel);
    plate.position.y = y;
    scene.add(plate);
  }
  const hoodMat = glass(0x2b4a7a, 0.18);
  const hoodTops: Record<"rawTop" | "rawBot" | "cleanTop" | "cleanBot", THREE.Vector3> = {} as never;
  for (const side of [1, -1] as const) {
    // nửa z>0 = khói thô, z<0 = khói sạch
    const zIn = side * PLATE_W / 2, zOut = side * CASE;
    const tz0 = side * R * 0.28, tz1 = side * R * 0.86;
    const base: [number, number, number, number] = [-CASE, CASE, Math.min(zIn, zOut), Math.max(zIn, zOut)];
    const topR: [number, number, number, number] = [-R * 0.5, R * 0.5, Math.min(tz0, tz1), Math.max(tz0, tz1)];
    for (const up of [1, -1] as const) {
      const y0 = up * (H / 2 + 0.5), y1 = up * (H / 2 + 0.5 + HOOD_H);
      addWithEdges(frustum(base, y0, topR, y1), hoodMat);
      const duct = new THREE.BoxGeometry(R, DUCT_H, topR[3] - topR[2]).translate(0, y1 + (up * DUCT_H) / 2, (topR[2] + topR[3]) / 2);
      addWithEdges(duct, hoodMat);
      const key = `${side > 0 ? "raw" : "clean"}${up > 0 ? "Top" : "Bot"}` as keyof typeof hoodTops;
      hoodTops[key] = new THREE.Vector3(0, y1 + up * DUCT_H, (topR[2] + topR[3]) / 2);
    }
  }
  // cụm truyền động + sàn thao tác trên tấm quạt (đỉnh)
  const deckY = H / 2 + 0.5 + HOOD_H;
  const deck = new THREE.Mesh(track(new THREE.BoxGeometry(2 * CASE + 1, 0.16, PLATE_W + 0.4)), steelDark);
  deck.position.y = deckY;
  scene.add(deck);
  const rail: number[] = [];
  for (const z of [-(PLATE_W / 2 + 0.2), PLATE_W / 2 + 0.2]) {
    rail.push(-CASE - 0.5, deckY + 1, z, CASE + 0.5, deckY + 1, z, -CASE - 0.5, deckY + 0.5, z, CASE + 0.5, deckY + 0.5, z);
    for (let x = -CASE - 0.5; x <= CASE + 0.5 + 1e-6; x += 1.5) rail.push(x, deckY, z, x, deckY + 1, z);
  }
  const railGeo = track(new THREE.BufferGeometry());
  railGeo.setAttribute("position", new THREE.Float32BufferAttribute(rail, 3));
  scene.add(new THREE.LineSegments(railGeo, track(new THREE.LineBasicMaterial({ color: 0x94a3b8 }))));
  const shaft = new THREE.Mesh(track(new THREE.CylinderGeometry(0.32, 0.32, deckY - H / 2, 16)), steelDark);
  shaft.position.y = (deckY + H / 2) / 2;
  scene.add(shaft);
  const gearbox = new THREE.Mesh(track(new THREE.BoxGeometry(1.6, 1.0, 1.1)), steel);
  gearbox.position.set(0, deckY + 0.6, 0);
  scene.add(gearbox);
  for (const x of [-1.25, 1.25]) {
    const motor = new THREE.Mesh(track(new THREE.CylinderGeometry(0.34, 0.34, 1.1, 20).rotateZ(Math.PI / 2)), steelDark);
    motor.position.set(x, deckY + 0.55, 0);
    scene.add(motor);
  }
  const grid = new THREE.GridHelper(80, 40, 0xcbd5e1, 0xdde3ea);
  grid.position.y = -(H / 2 + 0.5 + HOOD_H + DUCT_H) - 0.05;
  track(grid.geometry);
  scene.add(grid);

  /* ---- 2 cần vòi: thân cần chạy theo bán kính, đầu phun + tia, hộp dẫn động ngoài vỏ (chạm chọn vòi) ---- */
  type Lance = {
    tag: GghTag; angle: number; up: 1 | -1; pivot: THREE.Group; tube: THREE.Mesh; head: THREE.Group;
    marker: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>; label: CSS2DObject; el: HTMLSpanElement;
    steam: FlowParticles; water: FlowParticles; face: THREE.ShaderMaterial;
  };
  const lanceY = H / 2 + 0.75;
  // Cần vòi + hộp dẫn động + đầu phun màu cam nhạt cho nổi trên nền thép xanh (người dùng chọn 17/10/2026).
  const lanceMat = track(new THREE.MeshStandardMaterial({ color: 0xfdba74, metalness: 0.15, roughness: 0.55 }));
  const lanceDarkMat = track(new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.15, roughness: 0.55 }));
  const tubeGeo = track(new THREE.CylinderGeometry(0.09, 0.09, 1, 10).rotateZ(Math.PI / 2));
  const markerGeo = track(new THREE.SphereGeometry(0.42, 18, 12));
  const jetFlows = (up: 1 | -1) => {
    const pts = [0, 0.35, 0.72].map((d, i) => ({ pos: new THREE.Vector3(0, -up * d, 0), half: [0.05, 0.24, 0.42][i] }));
    const steam = createFlowParticles(track, {
      points: pts, lateral: new THREE.Vector3(0, 0, 1), coarse, fade: 0.12, grow: 0.9, colorStop: 0.4,
      colors: [new THREE.Color(1, 1, 1), new THREE.Color(0.97, 0.98, 1), new THREE.Color(0.9, 0.93, 0.97)],
      layers: [{ count: coarse ? 90 : 160, cloud: true, cycle: [0.7, 1.0], size: [0.3, 0.6], alpha: 0.75, spread: 0.12 }],
    });
    const water = createFlowParticles(track, {
      points: pts, lateral: new THREE.Vector3(0, 0, 1), coarse, fade: 0.08, grow: 0.4, colorStop: 0.5,
      colors: [new THREE.Color(0.55, 0.82, 1), new THREE.Color(0.7, 0.88, 1), new THREE.Color(0.86, 0.95, 1)],
      layers: [
        { count: coarse ? 130 : 230, cloud: false, cycle: [0.28, 0.42], size: [0.07, 0.15], alpha: 0.95, spread: 0.1 },
        { count: coarse ? 40 : 70, cloud: true, cycle: [0.6, 0.9], size: [0.25, 0.45], alpha: 0.35, spread: 0.12 },
      ],
    });
    return { steam, water };
  };
  const lances: Lance[] = [];
  for (const [tag, angle, up, face] of [["GGH-TREN", TOP_ANGLE, 1, topFaceMat], ["GGH-DUOI", BOT_ANGLE, -1, botFaceMat]] as const) {
    const pivot = new THREE.Group();
    pivot.rotation.y = -angle; // trục x cục bộ = hướng bán kính tới góc đặt cần
    scene.add(pivot);
    const y = up * lanceY;
    const tube = new THREE.Mesh(tubeGeo, lanceMat);
    tube.position.y = y;
    const head = new THREE.Group();
    const nozzle = new THREE.Mesh(track(new THREE.BoxGeometry(0.34, 0.26, 0.3)), lanceDarkMat);
    head.add(nozzle);
    const { steam, water } = jetFlows(up);
    steam.group.position.y = water.group.position.y = -up * 0.13;
    head.add(steam.group, water.group);
    // Hộp dẫn động ngang cao độ thân cần: cần vòi rút ra / thụt vào thẳng từ hộp → một thanh liền (17/10/2026).
    const carriage = new THREE.Mesh(track(new THREE.BoxGeometry(0.9, 0.7, 0.8)), lanceMat);
    carriage.position.set(LANCE_MOUNT + 0.45, y, 0);
    const marker = new THREE.Mesh(markerGeo, track(new THREE.MeshStandardMaterial({ color: STATUS_COLOR.OK, emissive: SELECT_COLOR, emissiveIntensity: 0 })));
    marker.position.set(LANCE_MOUNT + 0.45, y + up * 0.75, 0);
    marker.userData.tag = tag;
    carriage.userData.tag = tag;
    const el = pill(tag, LABEL_CLASS.OK);
    const label = new CSS2DObject(el);
    // Hai vòi cùng phương: lệch nhãn sang hai bên cần (trên ↔ dưới) để nhìn từ trên xuống không chồng nhau.
    label.position.set(LANCE_MOUNT + 0.45, y + up * 1.45, -up * 1.6);
    pivot.add(tube, head, carriage, marker, label);
    lances.push({ tag, angle, up, pivot, tube, head, marker, label, el, steam, water, face });
  }
  const pickables = lances.flatMap((l) => [l.marker, l.pivot.children.find((c) => c.userData.tag && c !== l.marker)!]);

  /* ---- khói thô (xuống, nửa z>0) / khói sạch (lên, nửa z<0) ---- */
  const gasPath = (from: THREE.Vector3, to: THREE.Vector3, z: number) => {
    const ys = [from.y, from.y * 0.62, H / 2 + 0.6, 0, -H / 2 - 0.6, to.y * 0.62, to.y];
    const halves = [1.1, 1.6, 2.3, 2.4, 2.3, 1.6, 1.1];
    return ys.map((y, i) => ({ pos: new THREE.Vector3(0, y, z), half: halves[i] }));
  };
  const flowLayers = (cycle: [number, number]) => [
    { count: coarse ? 280 : 480, cloud: true, cycle, size: [1.0, 1.9] as [number, number], alpha: 0.3, spread: R * 0.5 },
    { count: coarse ? 200 : 320, cloud: false, cycle: [cycle[0] * 0.5, cycle[1] * 0.5] as [number, number], size: [0.22, 0.42] as [number, number], alpha: 0.85, spread: R * 0.46 },
  ];
  const rawGas = createFlowParticles(track, {
    points: gasPath(hoodTops.rawTop, hoodTops.rawBot, hoodTops.rawTop.z), lateral: new THREE.Vector3(1, 0, 0), coarse, grow: 0.3,
    colors: [new THREE.Color(1, 0.5, 0.22), new THREE.Color(1, 0.7, 0.4), new THREE.Color(1, 0.88, 0.62)], colorStop: 0.5,
    layers: flowLayers([9, 12]),
  });
  const cleanGas = createFlowParticles(track, {
    points: gasPath(hoodTops.cleanBot, hoodTops.cleanTop, hoodTops.cleanBot.z), lateral: new THREE.Vector3(1, 0, 0), coarse, grow: 0.3,
    colors: [new THREE.Color(0.55, 0.75, 1), new THREE.Color(0.86, 0.9, 0.96), new THREE.Color(1, 0.82, 0.6)], colorStop: 0.5,
    layers: flowLayers([9, 12]),
  });
  scene.add(rawGas.group, cleanGas.group);
  const allFlows = [rawGas, cleanGas, ...lances.flatMap((l) => [l.steam, l.water])];
  if (coarse) for (const f of [rawGas, cleanGas]) f.setQuality(0.6);
  const flowLabels: CSS2DObject[] = [];
  // nhãn vào / ra của cùng một dòng lệch hai bên theo x — nhìn từ trên xuống không chồng nhau
  for (const [text, at, cls, dx] of [
    ["Khói thô vào", hoodTops.rawTop, "bg-orange-500/90 text-white", R * 0.55],
    ["Khói thô ra → tháp hấp thụ", hoodTops.rawBot, "bg-amber-400/90 text-slate-900", -R * 0.55],
    ["Khói sạch vào ← tháp hấp thụ", hoodTops.cleanBot, "bg-sky-500/90 text-white", R * 0.55],
    ["Khói sạch ra → ống khói", hoodTops.cleanTop, "bg-orange-300/90 text-slate-900", -R * 0.55],
  ] as const) {
    const lab = new CSS2DObject(pill(text, cls));
    lab.position.copy(at).add(new THREE.Vector3(dx, at.y > 0 ? 1.2 : -1.2, 0));
    scene.add(lab);
    flowLabels.push(lab);
  }

  /* ---- trạng thái + vẽ ---- */
  let mode: GghMode = "steam";
  let showTags = false;
  let hovered: string | null = null;
  let lastPaint: { statuses: Record<string, BlowerStatus>; selected: string | null } = { statuses: {}, selected: null };
  function paint(statuses: Record<string, BlowerStatus>, selected: string | null) {
    lastPaint = { statuses, selected };
    for (const l of lances) {
      const st = statuses[l.tag] ?? "OK";
      const sel = selected === l.tag;
      l.marker.material.color.setHex(sel ? SELECT_COLOR : STATUS_COLOR[st]);
      l.marker.material.emissiveIntensity = sel ? 0.4 : 0;
      l.marker.scale.setScalar(sel || hovered === l.tag ? 1.35 : 1);
      l.label.visible = showTags || sel || st !== "OK" || hovered === l.tag;
      l.el.className = `pointer-events-none whitespace-nowrap rounded px-1 py-0.5 font-mono text-[10px] font-bold shadow ${LABEL_CLASS[sel ? "SEL" : st]}`;
    }
    requestRender();
  }

  // đồng hồ mô phỏng: máy đặt "giảm chuyển động" thì đứng yên giữa hành trình (vẫn thấy vệt sạch / bẩn)
  let t = reduceMotion ? STROKE * 0.55 : 0;
  function applyTime() {
    const phi = OMEGA * t;
    rotor.rotation.y = phi;
    const ls = lanceState(t);
    for (const l of lances) {
      const tip = ls.r;
      const mount = LANCE_MOUNT;
      l.tube.scale.x = Math.max(mount - tip, 0.01);
      l.tube.position.x = (mount + tip) / 2;
      l.head.position.set(tip, l.up * (lanceY - 0.05), 0);
      const jetOn = ls.jet;
      l.steam.group.visible = jetOn && mode === "steam";
      l.water.group.visible = jetOn && mode === "water";
      const u = l.face.uniforms;
      u.uS.value = ls.s;
      u.uRl.value = tip;
      // góc (trong hệ rô-to) của điểm đang nằm dưới cần vòi: góc đặt cần + góc rô-to đã quay
      u.uThetaNow.value = l.angle + phi;
      u.uSoil.value = ls.soil;
      u.uJet.value = jetOn ? 1 : 0;
    }
    for (const f of allFlows) f.setTime(t);
  }
  applyTime();

  let onScreen = true;
  const animating = () => onScreen && !reduceMotion;
  const scaleFlows = () => { const s = flowPointScale(renderer, camera); for (const f of allFlows) f.setScale(s); };
  scaleFlows();

  type Flight = { from: THREE.Spherical; to: THREE.Spherical; k: number };
  let flight: Flight | null = null;
  const offset = new THREE.Vector3();
  const sph = new THREE.Spherical();
  let frame = 0, last = 0, lastDraw = 0, slowFor = 0;
  let dirty = true;
  function loop(now: number) {
    frame = 0;
    if (!ready) return; // shader còn đang biên dịch — vẽ khi xong (compileAsync bên dưới)
    const dt = last ? Math.min((now - last) / 1000, 0.1) : 0.016;
    last = now;
    let busy = controls.update(dt);
    if (flight) {
      flight.k = Math.min(flight.k + dt / 0.8, 1);
      const e = flight.k < 0.5 ? 4 * flight.k ** 3 : 1 - (-2 * flight.k + 2) ** 3 / 2;
      sph.set(flight.from.radius + (flight.to.radius - flight.from.radius) * e, flight.from.phi + (flight.to.phi - flight.from.phi) * e, flight.from.theta + (flight.to.theta - flight.from.theta) * e);
      camera.position.setFromSpherical(sph).add(controls.target);
      controls.update();
      if (flight.k >= 1) flight = null;
      busy = true;
    }
    const sceneChanged = busy || dirty;
    const anim = animating();
    if (anim) {
      t += dt;
      applyTime();
      // máy yếu: hoạt ảnh chạy một mình mà nhịp khung vẫn dưới ~20/giây suốt 2 giây → bớt hạt khói
      slowFor = !sceneChanged && dt > 0.05 ? slowFor + dt : 0;
      if (slowFor > 2 && rawGas.quality > 0.36) {
        for (const f of [rawGas, cleanGas]) f.setQuality(f.quality > 0.7 ? 0.65 : 0.35);
        slowFor = 0;
      }
    }
    if (sceneChanged || !anim || now - lastDraw >= FLOW_FRAME_MS) {
      renderer.render(scene, camera);
      if (sceneChanged) labels.render(scene, camera);
      lastDraw = now;
      dirty = false;
    }
    if (busy || anim) scheduleFrame();
    else last = 0;
  }
  function scheduleFrame() {
    if (!frame) frame = requestAnimationFrame(loop);
  }
  function requestRender() {
    dirty = true;
    scheduleFrame();
  }
  controls.addEventListener("change", requestRender);
  const onStart = () => (flight = null);
  controls.addEventListener("start", onStart);

  function fly(view: GghView) {
    controls.target.copy(TARGET);
    const from = new THREE.Spherical().setFromVector3(offset.copy(camera.position).sub(TARGET));
    const to = new THREE.Spherical().setFromVector3(offset.set(...VIEW_POS[view]).sub(TARGET));
    // khung dọc (điện thoại): lùi xa hơn cho vừa bề ngang, kể cả hộp dẫn động + nhãn hai cần vòi
    if (camera.aspect < 1) to.radius *= 1.35;
    to.theta = from.theta + ((((to.theta - from.theta + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
    flight = { from, to, k: 0 };
    requestRender();
  }

  /* ---- chạm / rê chuột ---- */
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const pickAt = (ev: PointerEvent) => {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return (ray.intersectObjects(pickables, false)[0]?.object.userData.tag as string | undefined) ?? null;
  };
  let down: { x: number; y: number } | null = null;
  const onDown = (ev: PointerEvent) => (down = { x: ev.clientX, y: ev.clientY });
  const onUp = (ev: PointerEvent) => {
    if (!down) return;
    const moved = Math.hypot(ev.clientX - down.x, ev.clientY - down.y);
    down = null;
    if (moved > 6) return;
    const tag = pickAt(ev);
    if (tag) onPick(tag);
  };
  const onMove = (ev: PointerEvent) => {
    if (ev.pointerType !== "mouse" || ev.buttons) return;
    const tag = pickAt(ev);
    if (tag === hovered) return;
    hovered = tag;
    renderer.domElement.style.cursor = tag ? "pointer" : "";
    paint(lastPaint.statuses, lastPaint.selected);
  };
  renderer.domElement.addEventListener("pointerdown", onDown);
  renderer.domElement.addEventListener("pointerup", onUp);
  renderer.domElement.addEventListener("pointermove", onMove);

  const resize = new ResizeObserver(() => {
    camera.aspect = width() / height();
    camera.updateProjectionMatrix();
    renderer.setSize(width(), height());
    labels.setSize(width(), height());
    scaleFlows();
    requestRender();
  });
  resize.observe(host);
  const visibility = new IntersectionObserver(([entry]) => {
    onScreen = entry?.isIntersecting ?? true;
    if (onScreen) requestRender();
  });
  visibility.observe(host);

  // Biên dịch shader KHÔNG chặn luồng chính (KHR_parallel_shader_compile) trước khung đầu, gồm cả vật đang ẩn (dòng khói,
  // tia hơi / nước) — three chỉ biên dịch vật đang hiện nên tạm bật rồi trả lại; không thì lúc bật mới biên dịch → khựng.
  // Đo 17/10/2026: khung đầu biên dịch đồng bộ 94–127 ms (máy không GPU).
  let ready = false;
  const lazyGroups = [rawGas.group, cleanGas.group, ...lances.flatMap((l) => [l.steam.group, l.water.group])];
  const wasVisible = lazyGroups.map((g) => g.visible);
  for (const g of lazyGroups) g.visible = true;
  renderer.compileAsync(scene, camera).catch(() => {}).finally(() => {
    ready = true;
    requestRender();
  });
  lazyGroups.forEach((g, i) => (g.visible = wasVisible[i]));

  return {
    api: {
      paint,
      fly,
      setShowTags(on) {
        showTags = on;
        paint(lastPaint.statuses, lastPaint.selected);
      },
      setFlow(on) {
        rawGas.group.visible = cleanGas.group.visible = on;
        for (const lab of flowLabels) lab.visible = on;
        requestRender();
      },
      setMode(next) {
        mode = next;
        for (const l of lances) l.face.uniforms.uJetColor.value.set(next === "water" ? 0x7dd3fc : 0xffffff);
        applyTime();
        requestRender();
      },
    },
    dispose() {
      cancelAnimationFrame(frame);
      resize.disconnect();
      visibility.disconnect();
      controls.removeEventListener("change", requestRender);
      controls.removeEventListener("start", onStart);
      controls.dispose();
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      renderer.domElement.removeEventListener("pointermove", onMove);
      for (const l of lances) l.el.remove();
      for (const lab of flowLabels) lab.element.remove();
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      renderer.domElement.remove();
      labels.domElement.remove();
    },
  };
}

/* ==================== Thành phần React ==================== */
export default function Ggh3D({
  statuses,
  selected,
  onSelect,
}: {
  statuses: Record<string, BlowerStatus>;
  selected: string | null;
  onSelect: (tag: string) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<Scene | null>(null);
  const pickRef = useRef(onSelect);
  const [supported] = useState(webgl2Supported);
  const [view, setView] = useState<GghView>("overview");
  const [showTags, setShowTags] = useState(false);
  // Mặc định không hiện dòng khói (người dùng chọn 17/10/2026) — tick "Dòng khói" để bật.
  const [showFlow, setShowFlow] = useState(false);
  const [mode, setMode] = useState<GghMode>("steam");

  useEffect(() => {
    pickRef.current = onSelect;
  }, [onSelect]);
  useEffect(() => {
    const host = hostRef.current;
    if (!host || !supported) return;
    const { api, dispose } = createScene(host, (tag) => pickRef.current(tag));
    sceneRef.current = api;
    return () => {
      sceneRef.current = null;
      dispose();
    };
  }, [supported]);
  useEffect(() => sceneRef.current?.paint(statuses, selected), [statuses, selected, supported]);
  useEffect(() => sceneRef.current?.fly(view), [view, supported]);
  useEffect(() => sceneRef.current?.setShowTags(showTags), [showTags, supported]);
  useEffect(() => sceneRef.current?.setFlow(showFlow), [showFlow, supported]);
  useEffect(() => sceneRef.current?.setMode(mode), [mode, supported]);

  if (!supported) {
    return <p className="p-6 text-sm text-slate-600">Thiết bị không hỗ trợ đồ hoạ 3D. Chọn “Sơ đồ” để xem vòi.</p>;
  }
  const btn = (active: boolean) =>
    `h-9 rounded-lg border px-3 text-xs font-semibold shadow-sm ${active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white/90 text-slate-700 hover:bg-white"}`;
  const check = "flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white/90 px-3 text-xs font-semibold text-slate-700 shadow-sm hover:bg-white";
  return (
    <div className="relative h-[62vh] max-h-[640px] min-h-[380px] w-full select-none overflow-hidden">
      <div ref={hostRef} className="absolute inset-0" />
      {/* z-10: nằm trên lớp nhãn 3D (CSS2D) — nhãn dòng khói không được che nút */}
      <div className="pointer-events-none absolute inset-x-2 top-2 z-10 flex flex-wrap items-start justify-between gap-1">
        <div className="pointer-events-auto flex flex-wrap gap-1" role="group" aria-label="Góc nhìn GGH">
          {(Object.keys(VIEW_LABEL) as GghView[]).map((v) => (
            <button key={v} type="button" onClick={() => setView(v)} aria-pressed={view === v} className={btn(view === v)}>
              {VIEW_LABEL[v]}
            </button>
          ))}
        </div>
        <div className="pointer-events-auto flex flex-wrap gap-1">
          <div className="flex overflow-hidden rounded-lg border border-slate-300 shadow-sm" role="group" aria-label="Chế độ làm sạch">
            {(["steam", "water"] as const).map((m) => (
              <button key={m} type="button" onClick={() => setMode(m)} aria-pressed={mode === m}
                className={`h-9 px-3 text-xs font-semibold ${mode === m ? "bg-slate-900 text-white" : "bg-white/90 text-slate-700 hover:bg-white"}`}>
                {m === "steam" ? "Thổi hơi" : "Rửa nước"}
              </button>
            ))}
          </div>
          <label className={check}>
            <input type="checkbox" checked={showFlow} onChange={(e) => setShowFlow(e.target.checked)} className="h-4 w-4 accent-slate-900" />
            Dòng khói
          </label>
          <label className={check}>
            <input type="checkbox" checked={showTags} onChange={(e) => setShowTags(e.target.checked)} className="h-4 w-4 accent-slate-900" />
            Hiện tên vòi
          </label>
        </div>
      </div>
      <p className="pointer-events-none absolute bottom-3 left-3 z-10 max-w-[calc(100%-200px)] rounded bg-white/80 px-2 py-1 text-[11px] text-slate-500">
        Rô-to {String(GGH_RPM).replace(".", ",")} vòng/phút khi thổi bụi / rửa nước · kích thước tương đối · chạm vòi để chọn
      </p>
    </div>
  );
}
