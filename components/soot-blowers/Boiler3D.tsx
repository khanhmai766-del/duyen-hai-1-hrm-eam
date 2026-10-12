"use client";

import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import {
  BOILER_BURNERS,
  BOILER_FACES,
  BOILER_FLAME_PLUME,
  BOILER_FLAME_W,
  BOILER_INNER_LINES,
  BOILER_PROFILE,
  BOILER_PROFILE_DEPTH,
  BOILER_PROFILE_HEIGHT,
  BOILER_WALL_LABEL,
  SB_3D_BY_TAG,
  SB_3D_PLACEMENTS,
  SB_3D_TYPE_WALLS,
  matchesFilter,
  type BlowerPlacement,
  type SootBlowerFilter,
  type BoilerWall,
} from "@/lib/soot-blower-3d";
import { SOOT_BLOWER_TYPE_NAME } from "@/lib/soot-blower-layout";

/* Mô hình 3D lò hơi cho sơ đồ vòi thổi bụi — three.js thuần (không dùng react-three-fiber:
   thư viện đó khai báo thẻ JSX toàn cục và làm hỏng kiểu `Icon` ở nhiều trang khác).
   Thân lò là mặt cắt dọc (BOILER_PROFILE — hình dạng vách trái/phải) đùn theo bề rộng lò,
   không tải tệp mô hình. Chỉ vẽ lại khi xoay / bay camera / đổi dữ liệu → đỡ tốn pin. */

export type BlowerStatus = "OK" | "WARN" | "BAD";

const PX = 0.5; // 1 m mặt cắt → đơn vị cảnh
const FW = 16; // bề rộng lò ≈ 32 m (trục x, trái → phải)
const DEPTH = BOILER_PROFILE_DEPTH * PX;
const HEIGHT = BOILER_PROFILE_HEIGHT * PX;
/** Chiều sâu mặt cắt → trục z (trước lò hướng +z, tâm mặt cắt ở z = 0). */
const zOf = (d: number) => DEPTH / 2 - d * PX;
const yOf = (h: number) => h * PX;
const TARGET = new THREE.Vector3(0, HEIGHT * 0.48, 0);
/** Giữa thân dưới buồng đốt theo chiều sâu — chỗ đặt nhãn vách bên. */
const BOILER_LOWER_MID = (BOILER_BURNERS[0].from[0] + BOILER_BURNERS[1].from[0]) / 2;

// khả dụng = xanh lá · có khiếm khuyết = vàng · bất khả dụng = cam (cùng bảng màu với sơ đồ DCS)
const STATUS_COLOR: Record<BlowerStatus, number> = { OK: 0x16a34a, WARN: 0xfacc15, BAD: 0xf97316 };
const SELECT_COLOR = 0x1d4ed8;
const LABEL_CLASS: Record<BlowerStatus | "SEL", string> = {
  SEL: "bg-blue-700 text-white",
  BAD: "bg-orange-500 text-white",
  WARN: "bg-yellow-300 text-slate-900",
  OK: "bg-green-600 text-white",
};

export type BoilerView = "overview" | "front" | "rear" | "left" | "right";
const VIEW_LABEL: Record<BoilerView, string> = { overview: "Toàn cảnh", front: "Trước", rear: "Sau", left: "Trái", right: "Phải" };
const VIEW_POS: Record<BoilerView, [number, number, number]> = {
  overview: [88, 64, 107],
  front: [0, 20, 139],
  rear: [0, 20, -139],
  left: [-139, 20, 0],
  right: [139, 20, 0],
};
const WALL_VIEW: Record<BoilerWall, BoilerView> = { front: "front", rear: "rear", left: "left", right: "right", ah: "rear" };
const TYPE_VIEW: Record<SootBlowerFilter, BoilerView> = { IK: "left", IR: "overview", IKEL: "rear", IKSH: "left", IKAH: "rear", ALL: "overview" };

/** Điểm trên mặt vách + pháp tuyến hướng ra ngoài. */
function anchor(p: Pick<BlowerPlacement, "wall" | "u" | "h" | "d">): { pos: THREE.Vector3; normal: THREE.Vector3 } {
  const y = yOf(p.h);
  switch (p.wall) {
    case "front":
      return { pos: new THREE.Vector3(-FW / 2 + p.u * FW, y, zOf(p.d ?? 0)), normal: new THREE.Vector3(0, 0, 1) };
    case "rear":
      return { pos: new THREE.Vector3(FW / 2 - p.u * FW, y, zOf(p.d ?? 0)), normal: new THREE.Vector3(0, 0, -1) };
    case "left":
      return { pos: new THREE.Vector3(-FW / 2, y, zOf((1 - p.u) * BOILER_PROFILE_DEPTH)), normal: new THREE.Vector3(-1, 0, 0) };
    case "right":
      return { pos: new THREE.Vector3(FW / 2, y, zOf(p.u * BOILER_PROFILE_DEPTH)), normal: new THREE.Vector3(1, 0, 0) };
    case "ah":
      return { pos: new THREE.Vector3(FW / 2 - p.u * FW, y, zOf(p.d ?? BOILER_PROFILE_DEPTH)), normal: new THREE.Vector3(0, 0, -1) };
  }
}

/** Các đoạn thẳng đứng nằm trong mặt cắt tại chiều sâu d (để kẻ ống trên vách bên). */
function verticalSpans(d: number): [number, number][] {
  const hs: number[] = [];
  for (let i = 0; i < BOILER_PROFILE.length; i++) {
    const [d0, h0] = BOILER_PROFILE[i];
    const [d1, h1] = BOILER_PROFILE[(i + 1) % BOILER_PROFILE.length];
    if (d0 === d1 || d < Math.min(d0, d1) || d >= Math.max(d0, d1)) continue;
    hs.push(h0 + ((d - d0) / (d1 - d0)) * (h1 - h0));
  }
  hs.sort((a, b) => a - b);
  const spans: [number, number][] = [];
  for (let i = 0; i + 1 < hs.length; i += 2) spans.push([hs[i], hs[i + 1]]);
  return spans;
}

/** Dải lửa bám theo đường cong (mặt z–y), thon dần về hai đầu. */
function flameRibbon(points: readonly [number, number][], half: number): THREE.Shape {
  const curve = new THREE.CatmullRomCurve3(points.map(([d, h]) => new THREE.Vector3(zOf(d), yOf(h), 0)));
  const pts = curve.getPoints(80);
  const left: THREE.Vector2[] = [];
  const right: THREE.Vector2[] = [];
  pts.forEach((p, i) => {
    const a = pts[Math.max(i - 1, 0)];
    const b = pts[Math.min(i + 1, pts.length - 1)];
    const n = new THREE.Vector2(-(b.y - a.y), b.x - a.x).normalize();
    const t = i / (pts.length - 1);
    const w = half * (0.35 + 0.65 * Math.min(1, t * 5, (1 - t) * 5));
    left.push(new THREE.Vector2(p.x + n.x * w, p.y + n.y * w));
    right.push(new THREE.Vector2(p.x - n.x * w, p.y - n.y * w));
  });
  return new THREE.Shape([...left, ...right.reverse()]);
}

/** Đùn một hình trên mặt (z, y) theo bề rộng lò: x từ x0 đến x0 + depth. */
function extrudeAcross(shape: THREE.Shape, depth: number, x0: number) {
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 6 });
  geo.rotateY(-Math.PI / 2); // trục đùn của shape → -x
  geo.translate(x0 + depth, 0, 0);
  return geo;
}

function pill(text: string, cls: string) {
  const el = document.createElement("span");
  el.textContent = text;
  el.className = `pointer-events-none whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-bold ${cls}`;
  return el;
}

type Scene = {
  setType: (type: SootBlowerFilter) => void;
  paint: (statuses: Record<string, BlowerStatus>, selected: string | null) => void;
  fly: (view: BoilerView) => void;
  setShowTags: (on: boolean) => void;
};

/* ==================== Dựng cảnh (một lần) ==================== */
function createScene(host: HTMLDivElement, onPick: (tag: string) => void): { api: Scene; dispose: () => void } {
  const width = () => Math.max(host.clientWidth, 1);
  const height = () => Math.max(host.clientHeight, 1);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width(), height());
  renderer.domElement.style.touchAction = "none";
  host.appendChild(renderer.domElement);

  const labels = new CSS2DRenderer();
  labels.setSize(width(), height());
  Object.assign(labels.domElement.style, { position: "absolute", inset: "0", pointerEvents: "none" });
  host.appendChild(labels.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xe8ecf1);
  scene.add(new THREE.AmbientLight(0xffffff, 0.85));
  const sun = new THREE.DirectionalLight(0xffffff, 1.1);
  sun.position.set(20, 40, 25);
  scene.add(sun);

  const camera = new THREE.PerspectiveCamera(26, width() / height(), 1, 600);
  camera.position.set(...VIEW_POS.overview);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(TARGET);
  // Thu phóng tự làm (có quán tính) nên tắt zoom của OrbitControls; quán tính xoay dừng gọn hơn mặc định 0.05.
  Object.assign(controls, {
    enableDamping: true,
    dampingFactor: 0.12,
    enablePan: false,
    enableZoom: false,
    rotateSpeed: 0.9,
    minDistance: 25,
    maxDistance: 220,
    maxPolarAngle: Math.PI * 0.62,
  });
  controls.update();

  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(x: T) => (disposables.push(x), x);
  const glass = (color: number, opacity: number) =>
    track(new THREE.MeshStandardMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false }));
  const line = (color: number, opacity = 1) => track(new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity }));

  /* ---- thân lò: mặt cắt dọc đùn theo bề rộng ---- */
  const shape = new THREE.Shape(BOILER_PROFILE.map(([d, h]) => new THREE.Vector2(zOf(d), yOf(h))));
  // Shape nằm trên mặt (z, y); đùn theo trục riêng của nó rồi xoay -90° quanh y → hướng đùn thành -x.
  const bodyGeo = track(extrudeAcross(shape, FW, -FW / 2));
  const hidden = track(new THREE.MeshBasicMaterial({ visible: false }));
  // nhóm 0 = hai nắp (vẽ riêng để tô sáng từng vách bên), nhóm 1 = vỏ quanh
  scene.add(new THREE.Mesh(bodyGeo, [hidden, glass(0xcbd5e1, 0.14)]));
  scene.add(new THREE.LineSegments(track(new THREE.EdgesGeometry(bodyGeo, 20)), line(0x334155)));

  const wallMats = new Map<BoilerWall, THREE.MeshStandardMaterial>();
  const wallTags = new Map<BoilerWall, HTMLSpanElement>();
  const wallFacing: { obj: CSS2DObject; at: THREE.Vector3; normal: THREE.Vector3 }[] = [];
  function wallLabel(key: BoilerWall, pos: THREE.Vector3, at: THREE.Vector3, normal: THREE.Vector3) {
    const el = pill(BOILER_WALL_LABEL[key], "uppercase tracking-wide");
    const tag = new CSS2DObject(el);
    tag.position.copy(pos);
    scene.add(tag);
    wallTags.set(key, el);
    wallFacing.push({ obj: tag, at, normal });
  }
  // vách trái/phải = hai nắp mặt cắt
  const capGeo = track(new THREE.ShapeGeometry(shape));
  capGeo.rotateY(-Math.PI / 2);
  for (const [key, x] of [["left", -FW / 2], ["right", FW / 2]] as const) {
    const mat = glass(0xcbd5e1, 0.12);
    const cap = new THREE.Mesh(capGeo, mat);
    cap.position.x = x;
    scene.add(cap);
    wallMats.set(key, mat);
    const normal = new THREE.Vector3(Math.sign(x), 0, 0);
    wallLabel(key, new THREE.Vector3(x * 1.12, -0.8, zOf(BOILER_LOWER_MID)), new THREE.Vector3(x, HEIGHT / 2, 0), normal);
  }
  // vách trước / sau / bộ sấy = các mảng phẳng phủ lên vỏ để tô sáng
  for (const key of ["front", "rear", "ah"] as const) {
    const mat = glass(0xcbd5e1, 0);
    const sign = key === "front" ? 1 : -1;
    for (const f of BOILER_FACES[key]) {
      const plane = new THREE.Mesh(track(new THREE.PlaneGeometry(FW, (f.h[1] - f.h[0]) * PX)), mat);
      plane.position.set(0, yOf((f.h[0] + f.h[1]) / 2), zOf(f.d) + sign * 0.02);
      plane.rotation.y = key === "front" ? 0 : Math.PI;
      scene.add(plane);
    }
    wallMats.set(key, mat);
    const f = BOILER_FACES[key][0];
    const normal = new THREE.Vector3(0, 0, sign);
    // nhãn đặt dưới chân, ra ngoài phần nhô xa nhất phía đó; bộ sấy đặt trên nóc để không chồng nhãn vách sau
    const labelAt = key === "front" ? new THREE.Vector3(0, -0.8, zOf(0) + 1.5) : new THREE.Vector3(0, key === "ah" ? yOf(f.h[1]) + 1.5 : -0.8, zOf(f.d) - 1.5);
    wallLabel(key, labelAt, new THREE.Vector3(0, yOf((f.h[0] + f.h[1]) / 2), zOf(f.d)), normal);
  }
  // ống vách: đứng trên hai vách bên (cắt theo mặt cắt) và trên các mảng vách trước/sau
  const tubePts: number[] = [];
  for (let d = 0.6; d < BOILER_PROFILE_DEPTH; d += 1.2) {
    for (const [h0, h1] of verticalSpans(d)) {
      for (const x of [-FW / 2, FW / 2]) tubePts.push(x, yOf(h0), zOf(d), x, yOf(h1), zOf(d));
    }
  }
  for (const f of [...BOILER_FACES.front, ...BOILER_FACES.rear]) {
    for (let x = -FW / 2; x <= FW / 2 + 1e-6; x += 0.6) tubePts.push(x, yOf(f.h[0]), zOf(f.d), x, yOf(f.h[1]), zOf(f.d));
  }
  const tubeGeo = track(new THREE.BufferGeometry());
  tubeGeo.setAttribute("position", new THREE.Float32BufferAttribute(tubePts, 3));
  scene.add(new THREE.LineSegments(tubeGeo, line(0x64748b, 0.22)));
  // nét trong trên hai vách bên: vòm, vách thân dưới, đáy phễu chữ V
  const innerPts: number[] = [];
  for (const path of BOILER_INNER_LINES) {
    for (let i = 0; i + 1 < path.length; i++) {
      for (const x of [-FW / 2, FW / 2]) innerPts.push(x, yOf(path[i][1]), zOf(path[i][0]), x, yOf(path[i + 1][1]), zOf(path[i + 1][0]));
    }
  }
  const innerGeo = track(new THREE.BufferGeometry());
  innerGeo.setAttribute("position", new THREE.Float32BufferAttribute(innerPts, 3));
  scene.add(new THREE.LineSegments(innerGeo, line(0x334155, 0.75)));
  // vòi đốt trên vòm trước/sau, chĩa xuống — rải đều theo bề rộng
  const BURNERS_PER_ARCH = 16;
  const burnerMat = track(new THREE.MeshStandardMaterial({ color: 0x9a3412 }));
  for (const b of BOILER_BURNERS) {
    const from = new THREE.Vector3(0, yOf(b.from[1]), zOf(b.from[0]));
    const to = new THREE.Vector3(0, yOf(b.to[1]), zOf(b.to[0]));
    const dir = to.clone().sub(from);
    const geo = track(new THREE.CylinderGeometry(0.1, 0.17, dir.length(), 8));
    const burners = new THREE.InstancedMesh(geo, burnerMat, BURNERS_PER_ARCH);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize().negate());
    const m = new THREE.Matrix4();
    for (let i = 0; i < BURNERS_PER_ARCH; i++) {
      const x = -FW / 2 + ((i + 0.5) / BURNERS_PER_ARCH) * FW;
      m.compose(new THREE.Vector3(x, (from.y + to.y) / 2, (from.z + to.z) / 2), q, new THREE.Vector3(1, 1, 1));
      burners.setMatrixAt(i, m);
    }
    scene.add(burners);
  }
  // ngọn lửa chữ W: từ hai vòm đi xuống sát vách thân dưới, quặt ở đáy, bốc lên giữa — liền một
  // khối theo bề rộng (lò có vòi đốt rải đều cả bề rộng), nhìn từ vách bên thấy rõ chữ W
  const flameMat = (color: number, opacity: number) =>
    track(new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false }));
  const flameW = FW * 0.9;
  // Khối dọc bề rộng chỉ vẽ mặt cong, nhạt (bỏ hai mặt đầu: nhìn thẳng vách bên, phối cảnh làm
  // mặt gần/xa lệch nhau thành hai chữ W chồng). Nét W đậm là một tấm phẳng ở giữa bề rộng lò.
  const hiddenCap = track(new THREE.MeshBasicMaterial({ visible: false }));
  for (const [layerShape, color, sheetOpacity, sideOpacity] of [
    [new THREE.Shape(BOILER_FLAME_PLUME.map(([d, h]) => new THREE.Vector2(zOf(d), yOf(h)))), 0xfb923c, 0.22, 0.05],
    [flameRibbon(BOILER_FLAME_W, 0.75), 0xf97316, 0.5, 0.1],
    [flameRibbon(BOILER_FLAME_W, 0.3), 0xfacc15, 0.9, 0.2],
  ] as const) {
    scene.add(new THREE.Mesh(track(extrudeAcross(layerShape, flameW, -flameW / 2)), [hiddenCap, flameMat(color, sideOpacity)]));
    const sheet = track(new THREE.ShapeGeometry(layerShape, 8));
    sheet.rotateY(-Math.PI / 2);
    scene.add(new THREE.Mesh(sheet, flameMat(color, sheetOpacity)));
  }
  const grid = new THREE.GridHelper(80, 40, 0xcbd5e1, 0xdde3ea);
  track(grid.geometry);
  scene.add(grid);

  /* ---- vòi ---- */
  type Marker = {
    tag: string;
    /** mặt đĩa tô màu trạng thái */
    body: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshStandardMaterial>;
    /** cả ký hiệu (đĩa + viền + chữ thập + ống hơi), phóng to khi được chọn */
    symbol: THREE.Group;
    hit: THREE.Mesh;
    label: CSS2DObject;
    el: HTMLSpanElement;
    normal: THREE.Vector3;
    /** nhãn luôn hiện (đang chọn / có vấn đề / đang rê chuột), không phụ thuộc ô "Hiện tên vòi" */
    pinned: boolean;
  };
  const blowerGroup = new THREE.Group();
  scene.add(blowerGroup);
  const hitGeo = track(new THREE.SphereGeometry(0.46, 10, 8));
  /* Ký hiệu vòi giống màn DCS: đĩa tròn màu trạng thái, viền đen, chữ thập đen, ống hơi đỏ đi lên từ đỉnh.
     Dựng trong hệ toạ độ riêng: z = pháp tuyến vách (hướng ra ngoài), y = hướng lên. Hình học dùng chung. */
  const SYM_R = 0.36; // bán kính đĩa
  const SYM_T = 0.1; // bề dày đĩa
  const SYM_GAP = 0.06; // khe cách mặt vách
  const discGeo = track(new THREE.CylinderGeometry(SYM_R, SYM_R, SYM_T, 32).rotateX(Math.PI / 2));
  const rimGeo = track(new THREE.TorusGeometry(SYM_R, 0.035, 8, 40));
  const crossHGeo = track(new THREE.BoxGeometry(SYM_R * 1.55, 0.07, 0.02));
  const crossVGeo = track(new THREE.BoxGeometry(0.07, SYM_R * 1.55, 0.02));
  const stemGeo = track(new THREE.CylinderGeometry(0.035, 0.035, 0.55, 8));
  const inkMat = track(new THREE.MeshBasicMaterial({ color: 0x111827 }));
  const steamMat = track(new THREE.MeshBasicMaterial({ color: 0xdc2626 }));
  const basis = new THREE.Matrix4();
  const UP = new THREE.Vector3(0, 1, 0);
  const hitMat = track(new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
  let markers: Marker[] = [];
  let hovered: string | null = null;
  let showTags = false; // ô "Hiện tên vòi": hiện nhãn mọi vòi của nhóm đang chọn
  let lastPaint: { statuses: Record<string, BlowerStatus>; selected: string | null } = { statuses: {}, selected: null };

  function clearMarkers() {
    for (const m of markers) {
      m.body.material.dispose();
      m.label.element.remove();
    }
    blowerGroup.clear();
    markers = [];
  }

  function setType(type: SootBlowerFilter) {
    clearMarkers();
    for (const p of SB_3D_PLACEMENTS.filter((x) => matchesFilter(type, x.type))) {
      const { pos, normal } = anchor(p);
      const symbol = new THREE.Group();
      const side = new THREE.Vector3().crossVectors(UP, normal);
      symbol.quaternion.setFromRotationMatrix(basis.makeBasis(side, UP, normal));
      symbol.position.copy(pos);
      const face = SYM_GAP + SYM_T;
      const body = new THREE.Mesh(discGeo, new THREE.MeshStandardMaterial({ color: STATUS_COLOR.OK }));
      body.position.z = SYM_GAP + SYM_T / 2;
      const rim = new THREE.Mesh(rimGeo, inkMat);
      rim.position.z = face;
      const crossH = new THREE.Mesh(crossHGeo, inkMat);
      const crossV = new THREE.Mesh(crossVGeo, inkMat);
      crossH.position.z = crossV.position.z = face + 0.01;
      const stem = new THREE.Mesh(stemGeo, steamMat);
      stem.position.set(0, SYM_R + 0.27, SYM_GAP + SYM_T / 2);
      symbol.add(body, rim, crossH, crossV, stem);
      const center = pos.clone().addScaledVector(normal, SYM_GAP + SYM_T / 2);
      const hit = new THREE.Mesh(hitGeo, hitMat);
      hit.position.copy(center);
      hit.userData.tag = p.tag;
      const el = pill(p.tag, "font-mono shadow");
      const label = new CSS2DObject(el);
      // nhãn đặt trên đầu ống hơi, lệch ra ngoài vách một chút cho khỏi chìm vào vỏ
      label.position.copy(center).addScaledVector(normal, 0.3).add(new THREE.Vector3(0, SYM_R + 0.85, 0));
      blowerGroup.add(symbol, hit, label);
      markers.push({ tag: p.tag, body, symbol, hit, label, el, normal, pinned: false });
    }
    // "Tất cả": không tô sáng vách nào (vòi có trên mọi vách, tô hết thì rối mắt)
    const walls = type === "ALL" ? [] : SB_3D_TYPE_WALLS[type];
    for (const [key, mat] of wallMats) {
      const on = walls.includes(key);
      const side = key === "left" || key === "right";
      mat.color.setHex(on ? 0x93c5fd : 0xcbd5e1);
      // mảng phủ vách trước/sau chỉ hiện khi được tô sáng — vỏ lò đã có màu nền
      mat.opacity = on ? (side ? 0.3 : 0.38) : side ? 0.1 : 0;
      wallTags.get(key)!.className = pillClass(on);
    }
    paint(lastPaint.statuses, lastPaint.selected);
  }
  const pillClass = (on: boolean) =>
    `pointer-events-none whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${on ? "bg-blue-700 text-white" : "bg-white/70 text-slate-500"}`;

  function paint(statuses: Record<string, BlowerStatus>, selected: string | null) {
    lastPaint = { statuses, selected };
    for (const m of markers) {
      const st = statuses[m.tag] ?? "OK";
      const sel = selected === m.tag;
      m.body.material.color.setHex(sel ? SELECT_COLOR : STATUS_COLOR[st]);
      m.body.material.emissive.setHex(sel ? SELECT_COLOR : 0x000000);
      m.body.material.emissiveIntensity = sel ? 0.4 : 0;
      m.symbol.scale.setScalar(sel ? 1.35 : 1);
      // nhãn chỉ hiện cho vòi có vấn đề / đang chọn / đang rê chuột — tránh rối và nặng
      // CSS2DRenderer tự ghi style.display mỗi lần vẽ → ẩn/hiện phải qua .visible
      m.pinned = sel || st !== "OK" || hovered === m.tag;
      m.label.visible = m.pinned || (showTags && facesCamera(m));
      m.el.className = `pointer-events-none whitespace-nowrap rounded px-1 py-0.5 font-mono text-[10px] font-bold shadow ${LABEL_CLASS[sel ? "SEL" : st]}`;
    }
    requestRender();
  }

  const toCamera = new THREE.Vector3();
  const facesCamera = (m: Marker) => toCamera.copy(camera.position).sub(m.symbol.position).normalize().dot(m.normal) > 0.15;

  /* ---- vòng vẽ theo nhu cầu + bay camera + thu phóng có quán tính ---- */
  // Bay: nội suy toạ độ cầu quanh tâm lò (bán kính, góc ngẩng, góc quay) với gia tốc êm đầu/cuối →
  // camera lượn vòng quanh lò thay vì đi đường thẳng xuyên qua thân lò.
  type Flight = { from: THREE.Spherical; to: THREE.Spherical; t: number; dur: number };
  let flight: Flight | null = null;
  let zoomGoal: number | null = null; // khoảng cách đích; camera trôi dần tới đó
  const offset = new THREE.Vector3();
  const sph = new THREE.Spherical();
  const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
  const clampDist = (r: number) => THREE.MathUtils.clamp(r, controls.minDistance, controls.maxDistance);
  const distance = () => camera.position.distanceTo(controls.target);
  let frame = 0;
  let last = 0;
  function loop(now: number) {
    frame = 0;
    const dt = last ? Math.min((now - last) / 1000, 0.1) : 0.016;
    last = now;
    let busy = controls.update(dt);
    if (flight) {
      flight.t = Math.min(flight.t + dt / flight.dur, 1);
      const k = easeInOut(flight.t);
      const { from, to } = flight;
      sph.set(
        from.radius + (to.radius - from.radius) * k,
        from.phi + (to.phi - from.phi) * k,
        from.theta + (to.theta - from.theta) * k,
      );
      camera.position.setFromSpherical(sph).add(controls.target);
      controls.update();
      if (flight.t >= 1) flight = null;
      busy = true;
    } else if (zoomGoal !== null) {
      offset.copy(camera.position).sub(controls.target);
      const r = offset.length();
      const next = r + (zoomGoal - r) * (1 - Math.exp(-dt * 11));
      const arrived = Math.abs(zoomGoal - next) < 0.02;
      offset.setLength(arrived ? zoomGoal : next);
      if (arrived) zoomGoal = null;
      camera.position.copy(controls.target).add(offset);
      controls.update();
      busy = true;
    }
    // chỉ hiện nhãn vách đang quay về phía người xem — nhìn thẳng thì các nhãn khác không chồng lên nhau
    // "Hiện tên vòi": chỉ vòi trên vách quay về phía người xem — vách xa nhìn xuyên kính sẽ chồng nhãn
    if (showTags) for (const m of markers) m.label.visible = m.pinned || facesCamera(m);
    for (const w of wallFacing) {
      const toCam = camera.position.clone().sub(w.at).normalize();
      w.obj.visible = toCam.dot(w.normal) > 0.25;
    }
    renderer.render(scene, camera);
    labels.render(scene, camera);
    if (busy) requestRender();
    else last = 0;
  }
  function requestRender() {
    if (!frame) frame = requestAnimationFrame(loop);
  }
  controls.addEventListener("change", requestRender);

  function fly(view: BoilerView) {
    zoomGoal = null;
    controls.target.copy(TARGET);
    const from = new THREE.Spherical().setFromVector3(offset.copy(camera.position).sub(TARGET));
    const to = new THREE.Spherical().setFromVector3(offset.set(...VIEW_POS[view]).sub(TARGET));
    // quay theo chiều ngắn nhất quanh lò
    const turn = ((((to.theta - from.theta + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
    to.theta = from.theta + turn;
    const travel = Math.abs(turn) + Math.abs(to.phi - from.phi);
    if (travel < 1e-3 && Math.abs(to.radius - from.radius) < 0.05) return requestRender();
    flight = { from, to, t: 0, dur: 0.55 + 0.35 * Math.min(travel / Math.PI, 1.4) };
    requestRender();
  }
  // người dùng tự kéo xoay thì thôi bay
  const onControlStart = () => (flight = null);
  controls.addEventListener("start", onControlStart);

  /* ---- chạm / rê chuột ---- */
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function pickAt(ev: PointerEvent): string | null {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(markers.map((m) => m.hit), false)[0];
    return (hit?.object.userData.tag as string | undefined) ?? null;
  }
  let down: { x: number; y: number } | null = null;
  // chụm hai ngón: tự theo dõi các điểm chạm vì zoom của OrbitControls đã tắt
  const touches = new Map<number, { x: number; y: number }>();
  let pinch: { spread: number; radius: number } | null = null;
  const spread = () => {
    const [a, b] = [...touches.values()];
    return Math.max(Math.hypot(a.x - b.x, a.y - b.y), 1);
  };
  const onDown = (ev: PointerEvent) => {
    down = { x: ev.clientX, y: ev.clientY };
    // cảm ứng: ngón tay quét xa hơn chuột nên xoay chậm lại cho vừa tay
    controls.rotateSpeed = ev.pointerType === "touch" ? 0.7 : 0.9;
    if (ev.pointerType !== "touch") return;
    touches.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (touches.size === 2) {
      flight = null;
      down = null; // đang chụm, không phải chạm chọn vòi
      pinch = { spread: spread(), radius: zoomGoal ?? distance() };
    }
  };
  const onTouchEnd = (ev: PointerEvent) => {
    touches.delete(ev.pointerId);
    if (touches.size < 2) pinch = null;
  };
  const onWheel = (ev: WheelEvent) => {
    ev.preventDefault();
    flight = null;
    const dy = ev.deltaY * (ev.deltaMode === 1 ? 16 : ev.deltaMode === 2 ? 400 : 1);
    zoomGoal = clampDist((zoomGoal ?? distance()) * Math.exp(dy * 0.0012));
    requestRender();
  };
  const onUp = (ev: PointerEvent) => {
    onTouchEnd(ev);
    if (!down) return;
    const moved = Math.hypot(ev.clientX - down.x, ev.clientY - down.y);
    down = null;
    if (moved > 6) return; // vừa kéo xoay, không phải chạm chọn
    const tag = pickAt(ev);
    if (tag) onPick(tag);
  };
  const onMove = (ev: PointerEvent) => {
    if (touches.has(ev.pointerId)) {
      touches.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (pinch && touches.size >= 2) {
        zoomGoal = clampDist((pinch.radius * pinch.spread) / spread());
        requestRender();
      }
      return;
    }
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
  renderer.domElement.addEventListener("pointercancel", onTouchEnd);
  renderer.domElement.addEventListener("wheel", onWheel, { passive: false });

  const resize = new ResizeObserver(() => {
    camera.aspect = width() / height();
    camera.updateProjectionMatrix();
    renderer.setSize(width(), height());
    labels.setSize(width(), height());
    requestRender();
  });
  resize.observe(host);

  return {
    api: {
      setType,
      paint,
      fly,
      setShowTags(on) {
        showTags = on;
        paint(lastPaint.statuses, lastPaint.selected);
      },
    },
    dispose() {
      cancelAnimationFrame(frame);
      resize.disconnect();
      controls.removeEventListener("change", requestRender);
      controls.removeEventListener("start", onControlStart);
      controls.dispose();
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("pointercancel", onTouchEnd);
      renderer.domElement.removeEventListener("wheel", onWheel);
      clearMarkers();
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      renderer.domElement.remove();
      labels.domElement.remove();
    },
  };
}

function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

/* ==================== Thành phần React ==================== */
export default function Boiler3D({
  type,
  statuses,
  selected,
  onSelect,
}: {
  type: SootBlowerFilter;
  statuses: Record<string, BlowerStatus>;
  selected: string | null;
  onSelect: (tag: string) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<Scene | null>(null);
  const pickRef = useRef(onSelect);
  const [supported] = useState(webglAvailable);
  // Góc nhìn mặc định suy từ loại vòi / vòi đang chọn; nút góc nhìn ghi đè cho đúng ngữ cảnh đó.
  const context = `${type}|${selected ?? ""}`;
  const selectedWall = selected ? SB_3D_BY_TAG[selected]?.wall : undefined;
  const autoView = selectedWall ? WALL_VIEW[selectedWall] : TYPE_VIEW[type];
  const [manual, setManual] = useState<{ view: BoilerView; context: string } | null>(null);
  const [showTags, setShowTags] = useState(false);
  const view = manual?.context === context ? manual.view : autoView;
  const count = SB_3D_PLACEMENTS.filter((p) => matchesFilter(type, p.type)).length;

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

  useEffect(() => sceneRef.current?.setType(type), [type, supported]);
  useEffect(() => sceneRef.current?.paint(statuses, selected), [statuses, selected, type, supported]);
  useEffect(() => sceneRef.current?.fly(view), [view, supported]);
  useEffect(() => sceneRef.current?.setShowTags(showTags), [showTags, supported]);

  if (!supported) {
    return <p className="p-6 text-sm text-slate-600">Thiết bị không hỗ trợ đồ hoạ 3D. Chọn “Sơ đồ” để xem vòi.</p>;
  }

  return (
    <div className="relative h-[62vh] max-h-[640px] min-h-[380px] w-full select-none overflow-hidden">
      <div ref={hostRef} className="absolute inset-0" />

      <div className="pointer-events-none absolute inset-x-2 top-2 flex flex-wrap items-start justify-between gap-1">
        {/* Góc nhìn nhanh */}
        <div className="pointer-events-auto flex flex-wrap gap-1" role="group" aria-label="Góc nhìn lò hơi">
          {(Object.keys(VIEW_LABEL) as BoilerView[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setManual({ view: v, context })}
              aria-pressed={view === v}
              className={`h-9 rounded-lg border px-3 text-xs font-semibold shadow-sm ${view === v ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white/90 text-slate-700 hover:bg-white"}`}
            >
              {VIEW_LABEL[v]}
            </button>
          ))}
        </div>
        <label className="pointer-events-auto flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white/90 px-3 text-xs font-semibold text-slate-700 shadow-sm hover:bg-white">
          <input
            type="checkbox"
            checked={showTags}
            onChange={(e) => setShowTags(e.target.checked)}
            className="h-4 w-4 accent-slate-900"
          />
          Hiện tên vòi
        </label>
      </div>

      {count === 0 && type !== "ALL" ? (
        <div className="pointer-events-none absolute inset-x-4 bottom-4 rounded-lg border border-dashed border-slate-400 bg-white/90 px-4 py-3 text-center text-sm text-slate-600">
          Chưa có dữ liệu {SOOT_BLOWER_TYPE_NAME[type]} — sẽ bổ sung theo màn DCS. Vị trí dự kiến:{" "}
          {SB_3D_TYPE_WALLS[type].map((w) => BOILER_WALL_LABEL[w].toLowerCase()).join(", ")}.
        </div>
      ) : (
        <p className="pointer-events-none absolute bottom-2 left-2 rounded bg-white/80 px-2 py-1 text-[11px] text-slate-500">
          Kéo để xoay · chụm/cuộn để phóng to · chạm vòi để chọn
        </p>
      )}
    </div>
  );
}
