import * as THREE from "three";

/* Hạt GPU chạy dọc một đường — dùng chung cho dòng khói lò (Boiler3D) và khói thô / khói sạch / tia phun của GGH (Ggh3D).
   Đường đi lấy mẫu đều theo chiều dài một lần vào texture float; vertex shader tự tính vị trí / màu / cỡ / độ mờ từ thời
   gian → mỗi khung CPU chỉ đổi một uniform, không vòng lặp JS, không đẩy lại bộ đệm (tối ưu 17/10/2026).
   Mỗi hạt: vị trí u trên đường + lệch trong lòng ống theo pháp tuyến (nửa bề rộng `half` tại điểm đó) + lệch theo trục
   rải ngang `lateral` (± `spread`), có xoáy nhẹ. Hai kiểu hạt: cuộn mây (mềm, mép nhiễu, nở dần) và vệt dòng (nhỏ, sáng). */

/** Nhịp vẽ khi chỉ có hoạt ảnh chạy (camera đứng yên): ~30 khung/giây — mắt khó thấy khác 60, GPU đỡ một nửa. */
export const FLOW_FRAME_MS = 1000 / 30 - 2;

/** Cỡ điểm ảnh của 1 đơn vị cảnh ở khoảng cách 1 — truyền cho `setScale` khi đổi cỡ khung / tỉ lệ điểm ảnh. */
export function flowPointScale(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera) {
  const buf = renderer.getDrawingBufferSize(new THREE.Vector2());
  return buf.y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
}

let webgl2: boolean | undefined;
/** Trình duyệt có WebGL2 (three.js ≥ 0.163 chỉ chạy WebGL2) — kiểm một lần rồi nhớ, ngữ cảnh thử được giải phóng ngay
    (mỗi lần mở mô hình tạo thêm một ngữ cảnh WebGL thì tốn bộ nhớ GPU và trình duyệt giới hạn số ngữ cảnh). */
export function webgl2Supported() {
  if (webgl2 !== undefined) return webgl2;
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    webgl2 = Boolean(gl);
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    webgl2 = false;
  }
  return webgl2;
}

const SAMPLES = 512;
const VERTEX = /* glsl */ `
  uniform sampler2D uPath;   // hàng 0: (vị trí xyz, nửa bề rộng lòng ống) · hàng 1: (pháp tuyến xyz, –)
  uniform float uSamples;
  uniform float uTime;
  uniform float uScale;
  uniform float uMaxSize;
  uniform vec3 uLateral;
  uniform float uSpread;
  uniform float uCloud;
  uniform float uAlpha;
  uniform float uFade;       // độ dài đoạn hiện dần / mờ dần ở hai đầu đường (phần u)
  uniform vec3 uC0;
  uniform vec3 uC1;
  uniform vec3 uC2;
  uniform float uStop;       // u chuyển từ màu C0→C1 sang C1→C2
  uniform float uGrow;       // cuộn khói nở thêm bao nhiêu khi đi hết đường
  attribute vec4 aMotion;    // u0, tốc độ (vòng/giây), lệch ngang [-1,1], lệch trong lòng ống [-1,1]
  attribute vec3 aLook;      // pha, cỡ gốc, hạt giống nhiễu
  varying float vAlpha;
  varying float vSeed;
  varying vec3 vColor;
  vec4 pathAt(float row, float i) { return texture2D(uPath, vec2((i + 0.5) / uSamples, (row + 0.5) / 2.0)); }
  void main() {
    float u = fract(aMotion.x + uTime * aMotion.y);
    float f = u * (uSamples - 1.0);
    float i = min(floor(f), uSamples - 2.0);
    float a = f - i;
    vec4 p = mix(pathAt(0.0, i), pathAt(0.0, i + 1.0), a);
    vec3 n = mix(pathAt(1.0, i).xyz, pathAt(1.0, i + 1.0).xyz, a);
    float ph = aLook.x;
    // xoáy nhẹ trong lòng ống + dạt theo trục rải ngang
    float swirl = sin(uTime * mix(1.6, 0.9, uCloud) + ph) * mix(0.12, 0.22, uCloud);
    float oy = clamp(aMotion.w + swirl, -1.0, 1.0) * p.w;
    float ox = aMotion.z * uSpread + sin(uTime * 0.6 + ph * 1.7) * mix(0.25, 0.5, uCloud) * step(0.001, uSpread);
    vec3 pos = p.xyz + n * oy + uLateral * ox;
    vAlpha = uAlpha * smoothstep(0.0, uFade, u) * (1.0 - smoothstep(1.0 - uFade, 1.0, u));
    // cuộn khói nở ra khi đi xa và to hơn trong lòng ống rộng
    float size = aLook.y * mix(1.0, (0.7 + uGrow * u) * (0.75 + 0.25 * min(p.w / 2.2, 1.6)), uCloud);
    vColor = u < uStop ? mix(uC0, uC1, u / uStop) : mix(uC1, uC2, (u - uStop) / max(1.0 - uStop, 0.001));
    vSeed = aLook.z;
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_PointSize = min(size * uScale / max(-mv.z, 0.1), uMaxSize);
    gl_Position = projectionMatrix * mv;
  }`;
const FRAGMENT = /* glsl */ `
  uniform float uCloud;
  varying float vAlpha;
  varying float vSeed;
  varying vec3 vColor;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  void main() {
    if (vAlpha < 0.004) discard;
    vec2 c = gl_PointCoord - 0.5;
    float r = length(c) * 2.0;
    if (r > 1.0) discard;
    float a = pow(1.0 - r, mix(2.6, 1.5, uCloud));
    // cuộn khói: nhiễu hai tầng theo hạt → mép lởm chởm như mây; vệt dòng bỏ qua nhiễu (đỡ tính)
    if (uCloud > 0.5) a *= 0.45 + 1.1 * (noise(c * 3.2 + vSeed * 17.0) * 0.6 + noise(c * 7.5 - vSeed * 9.0) * 0.4);
    // viền hơi xám để hạt sáng vẫn đọc được trên nền sáng
    vec3 col = mix(vColor * mix(0.82, 0.7, uCloud), vColor, smoothstep(0.95, 0.15, r));
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0) * vAlpha);
  }`;

export type FlowLayer = {
  count: number;
  /** cuộn mây (true) hay vệt dòng nhỏ (false) */
  cloud: boolean;
  /** thời gian (giây) một hạt đi hết đường: [nhanh nhất, chậm nhất] */
  cycle: [number, number];
  /** cỡ hạt (đơn vị cảnh): [nhỏ nhất, lớn nhất] */
  size: [number, number];
  alpha: number;
  /** nửa bề rộng rải theo trục ngang (đơn vị cảnh); 0 = không rải */
  spread: number;
};
export type FlowOptions = {
  /** tâm đường đi (đơn vị cảnh) + nửa bề rộng lòng ống tại điểm đó */
  points: readonly { pos: THREE.Vector3; half: number }[];
  /** trục rải ngang (vuông góc mặt phẳng đường đi); pháp tuyến trong lòng ống = lateral × tiếp tuyến */
  lateral: THREE.Vector3;
  /** 3 mốc màu theo chiều đi + vị trí mốc giữa (0–1) */
  colors: [THREE.Color, THREE.Color, THREE.Color];
  colorStop: number;
  layers: FlowLayer[];
  /** máy con trỏ thô (điện thoại): giới hạn cỡ điểm nhỏ hơn */
  coarse: boolean;
  fade?: number;
  grow?: number;
  closed?: boolean;
};

export function createFlowParticles(track: <T extends { dispose: () => void }>(x: T) => T, opt: FlowOptions) {
  const curve = new THREE.CatmullRomCurve3(opt.points.map((p) => p.pos.clone()), opt.closed ?? false, "centripetal");
  const widths = new THREE.CatmullRomCurve3(opt.points.map((p) => new THREE.Vector3(p.half, 0, 0)), opt.closed ?? false);
  const data = new Float32Array(SAMPLES * 2 * 4);
  const p = new THREE.Vector3();
  const tan = new THREE.Vector3();
  const nrm = new THREE.Vector3();
  const w = new THREE.Vector3();
  const lateral = opt.lateral.clone().normalize();
  for (let i = 0; i < SAMPLES; i++) {
    const t = curve.getUtoTmapping(i / (SAMPLES - 1), 0);
    curve.getPoint(t, p);
    curve.getTangent(t, tan);
    nrm.crossVectors(lateral, tan).normalize();
    data.set([p.x, p.y, p.z, widths.getPoint(t, w).x], i * 4);
    data.set([nrm.x, nrm.y, nrm.z, 0], (SAMPLES + i) * 4);
  }
  const path = track(new THREE.DataTexture(data, SAMPLES, 2, THREE.RGBAFormat, THREE.FloatType));
  path.minFilter = path.magFilter = THREE.NearestFilter; // nội suy tay trong shader (float tuyến tính cần extension)
  path.needsUpdate = true;

  const group = new THREE.Group();
  const time = { value: 0 };
  const scale = { value: 400 };
  const built: { geo: THREE.BufferGeometry; count: number }[] = [];
  const rnd = (a: number, b: number) => a + Math.random() * (b - a);
  for (const L of opt.layers) {
    const motion = new Float32Array(L.count * 4);
    const look = new Float32Array(L.count * 3);
    for (let k = 0; k < L.count; k++) {
      // dồn về giữa lòng ống (căn bậc hai đảo) cho đặc ở lõi, thưa ra mép
      const oy = Math.sign(Math.random() - 0.5) * (1 - Math.sqrt(Math.random()));
      motion.set([Math.random(), 1 / rnd(L.cycle[0], L.cycle[1]), rnd(-1, 1), oy], k * 4);
      look.set([rnd(0, Math.PI * 2), rnd(L.size[0], L.size[1]), Math.random()], k * 3);
    }
    const geo = track(new THREE.BufferGeometry());
    // three cần thuộc tính position để biết số điểm; vị trí thật do shader tính
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(L.count * 3), 3));
    geo.setAttribute("aMotion", new THREE.BufferAttribute(motion, 4));
    geo.setAttribute("aLook", new THREE.BufferAttribute(look, 3));
    const mat = track(new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: {
        uPath: { value: path }, uSamples: { value: SAMPLES }, uTime: time, uScale: scale,
        uMaxSize: { value: opt.coarse ? 120 : 180 }, uLateral: { value: lateral }, uSpread: { value: L.spread },
        uCloud: { value: L.cloud ? 1 : 0 }, uAlpha: { value: L.alpha }, uFade: { value: opt.fade ?? 0.07 },
        uC0: { value: opt.colors[0] }, uC1: { value: opt.colors[1] }, uC2: { value: opt.colors[2] }, uStop: { value: opt.colorStop },
        uGrow: { value: opt.grow ?? 0.55 },
      },
      transparent: true,
      depthWrite: false,
    }));
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false; // vị trí do shader tính, khung bao của bộ đệm không có ý nghĩa
    points.renderOrder = L.cloud ? 4 : 5;
    group.add(points);
    built.push({ geo, count: L.count });
  }

  let quality = 1;
  return {
    group,
    /** Thời gian mô phỏng (giây) — việc duy nhất phải làm mỗi khung. */
    setTime(t: number) {
      time.value = t;
    },
    setScale(s: number) {
      scale.value = s;
    },
    /** Tỉ lệ số hạt được vẽ (0–1) — hạt xếp ngẫu nhiên nên vẽ một phần đầu vẫn rải đều. */
    setQuality(q: number) {
      quality = q;
      for (const L of built) L.geo.setDrawRange(0, Math.max(1, Math.floor(L.count * q)));
    },
    get quality() {
      return quality;
    },
  };
}
export type FlowParticles = ReturnType<typeof createFlowParticles>;
