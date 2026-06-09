// WMO weather interpretation codes → Vietnamese label + emoji.
// Used with the free Open-Meteo API (no key required).

export const PLANT_LOCATION = {
  name: "Duyên Hải, Trà Vinh",
  latitude: 9.62,
  longitude: 106.48,
};

export function weatherInfo(code: number | null | undefined): { label: string; icon: string } {
  if (code == null) return { label: "—", icon: "🌡️" };
  if (code === 0) return { label: "Trời quang", icon: "☀️" };
  if ([1, 2].includes(code)) return { label: "Ít mây", icon: "🌤️" };
  if (code === 3) return { label: "Nhiều mây", icon: "☁️" };
  if ([45, 48].includes(code)) return { label: "Sương mù", icon: "🌫️" };
  if ([51, 53, 55, 56, 57].includes(code)) return { label: "Mưa phùn", icon: "🌦️" };
  if ([61, 63, 65, 66, 67].includes(code)) return { label: "Mưa", icon: "🌧️" };
  if ([71, 73, 75, 77].includes(code)) return { label: "Tuyết", icon: "🌨️" };
  if ([80, 81, 82].includes(code)) return { label: "Mưa rào", icon: "🌧️" };
  if ([95, 96, 99].includes(code)) return { label: "Dông bão", icon: "⛈️" };
  return { label: "Không xác định", icon: "🌡️" };
}

export interface WeatherScene {
  label: string;
  icon: string;
  /** Tailwind gradient classes for the card background that reflect the sky. */
  gradient: string;
  /** Whether the gradient is dark (→ use light text). */
  dark: boolean;
}

export function weatherScene(code: number | null | undefined): WeatherScene {
  const { label, icon } = weatherInfo(code);
  if (code == null) return { label, icon, gradient: "from-slate-100 to-slate-200", dark: false };
  if (code === 0) return { label, icon, gradient: "from-amber-300 via-orange-300 to-sky-300", dark: false };
  if ([1, 2].includes(code)) return { label, icon, gradient: "from-sky-300 via-sky-200 to-amber-100", dark: false };
  if (code === 3) return { label, icon, gradient: "from-slate-300 via-slate-200 to-sky-200", dark: false };
  if ([45, 48].includes(code)) return { label, icon, gradient: "from-slate-300 to-slate-400", dark: false };
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code))
    return { label, icon, gradient: "from-slate-500 via-slate-600 to-blue-700", dark: true };
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { label, icon, gradient: "from-sky-100 to-slate-200", dark: false };
  if ([95, 96, 99].includes(code)) return { label, icon, gradient: "from-slate-700 via-indigo-800 to-slate-900", dark: true };
  return { label, icon, gradient: "from-sky-200 to-blue-300", dark: false };
}

export interface WeatherData {
  current: { temperature_2m: number; weather_code: number };
  daily: { temperature_2m_max: number[]; temperature_2m_min: number[]; weather_code: number[] };
}

export async function fetchWeather(coords?: { latitude: number; longitude: number }): Promise<WeatherData> {
  const { latitude, longitude } = coords ?? PLANT_LOCATION;
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
    `&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,weather_code` +
    `&timezone=Asia%2FBangkok&forecast_days=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("weather fetch failed");
  return res.json();
}
