// Color options. Every colored value — the moving cube's GX color registers, the
// trail, the x/y/z letter textures and the UI accent — is derived from the original
// indigo by one transform: rotate the OKLCH hue, scale the chroma, keep the
// lightness. The render and the UI come out of the same transform, so they always
// match, and the default (indigo) leaves every value exactly as authored.

// sRGB channels, 0..255
export type Rgb = [number, number, number];

export interface ColorOption {
	id: string;
	label: string;
	// OKLCH hue (degrees) the UI accent lands on; omitted keeps indigo's hue
	hue?: number;
	// chroma relative to indigo's; omitted keeps it (1)
	chroma?: number;
}

// Every hue runs at indigo's chroma; some (teal, orange) can't reach it within
// sRGB at this lightness and are fitted down. Silver drops the chroma entirely.
export const COLOR_OPTIONS: ColorOption[] = [
	{id: "indigo", label: "Indigo"},
	{id: "blue", label: "Blue", hue: 258},
	{id: "teal", label: "Teal", hue: 195},
	{id: "green", label: "Green", hue: 145},
	{id: "orange", label: "Orange", hue: 50},
	{id: "red", label: "Red", hue: 25},
	{id: "pink", label: "Pink", hue: 350},
	{id: "silver", label: "Silver", chroma: 0},
];

// look an option up by id; a missing or unknown id (a fresh visit, a hand-edited
// save) falls back to the default
export const colorOption = (id: string | undefined): ColorOption =>
	COLOR_OPTIONS.find((option) => option.id === id) ?? COLOR_OPTIONS[0];

export interface Palette {
	// GX TEV color registers of the moving cube: C1 (env=0) and C0 (env=1)
	gxLo: Rgb;
	gxHi: Rgb;
	trail: Rgb;
	accent: Rgb;
	accentHover: Rgb;
	panel: Rgb;
	// recolors one texture pixel; null for the default, whose textures stay untouched
	recolor: ((rgb: Rgb) => Rgb) | null;
}

// the original indigo shades; the GX registers were recovered from the capture
const BASE: Omit<Palette, "recolor"> = {
	gxLo: [30, 20, 60],
	gxHi: [95, 80, 190],
	trail: [0x63, 0x50, 0xbb],
	accent: [125, 108, 240],
	accentHover: [141, 126, 245],
	panel: [8, 5, 18],
};

// OKLCH conversion (Björn Ottosson's OKLab, in polar form)

type Lch = [lightness: number, chroma: number, hue: number];
type Linear = [number, number, number];

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

const rgbToOklch = (rgb: Rgb): Lch => {
	const [r, g, b] = rgb.map((c) => toLinear(c / 255));
	const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
	const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
	const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
	const lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
	const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
	const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
	return [lightness, Math.hypot(a, bb), (Math.atan2(bb, a) * 180) / Math.PI];
};

const oklchToLinear = ([lightness, chroma, hue]: Lch): Linear => {
	const a = chroma * Math.cos((hue * Math.PI) / 180);
	const b = chroma * Math.sin((hue * Math.PI) / 180);
	const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
	const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
	const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
	return [
		4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
		-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
		-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
	];
};

const inGamut = (linear: Linear) => linear.every((c) => c >= -1e-4 && c <= 1 + 1e-4);

// rotate the hue and scale the chroma at constant lightness; a result outside sRGB
// backs its chroma off (bisection) until it fits, rather than clipping channels,
// which would skew the hue
const shift = (rgb: Rgb, hueShift: number, chromaScale: number): Rgb => {
	const [lightness, chroma, hue] = rgbToOklch(rgb);
	let fitted = chroma * chromaScale;
	if (!inGamut(oklchToLinear([lightness, fitted, hue + hueShift]))) {
		let low = 0;
		let high = fitted;
		for (let i = 0; i < 20; i++) {
			const mid = (low + high) / 2;
			if (inGamut(oklchToLinear([lightness, mid, hue + hueShift]))) low = mid;
			else high = mid;
		}
		fitted = low;
	}
	const linear = oklchToLinear([lightness, fitted, hue + hueShift]);
	return linear.map((c) => Math.round(toGamma(Math.min(1, Math.max(0, c))) * 255)) as Rgb;
};

const BASE_HUE = rgbToOklch(BASE.accent)[2];

export const paletteFor = (option: ColorOption): Palette => {
	const hueShift = option.hue === undefined ? 0 : option.hue - BASE_HUE;
	const chromaScale = option.chroma ?? 1;
	if (hueShift === 0 && chromaScale === 1) return {...BASE, recolor: null};
	const recolor = (rgb: Rgb) => shift(rgb, hueShift, chromaScale);
	return {
		gxLo: recolor(BASE.gxLo),
		gxHi: recolor(BASE.gxHi),
		trail: recolor(BASE.trail),
		accent: recolor(BASE.accent),
		accentHover: recolor(BASE.accentHover),
		panel: recolor(BASE.panel),
		recolor,
	};
};
