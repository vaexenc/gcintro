// Persisted state, split into the playback half (shared live with the UI) and the
// full saved record. Settings extends PlaybackState so the playback field names
// live in exactly one place; the save site only spells out the five extra fields.

export interface PlaybackState {
	speed: number;
	reverse: boolean;
	orbit: boolean;
	orbitIntensity: number;
	wireframe: boolean;
	loop: boolean;
}

export interface Settings extends PlaybackState {
	track: string;
	soundEnabled: boolean;
	volume: number;
	// transient playback position; only persisted in dev mode (see saveSettings)
	paused?: boolean;
	time?: number;
	// manually set to true in the stored JSON to opt into persisting paused/time
	dev?: boolean;
}

const STORAGE_KEY = "gcintro.settings";

// dev mode (manually set as "dev": true in the stored JSON) opts into persisting
// the transient playback position — paused state and clip time. Captured at load
// so saveSettings can both honor it and write it back. Off by default, so a normal
// visit always starts fresh from the beginning.
let devMode = false;

// a fresh visitor has no saved record, hence Partial; a corrupt or hand-edited
// value is treated the same as no record rather than throwing on startup
export const loadSettings = (): Partial<Settings> => {
	try {
		const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") as Partial<Settings>;
		devMode = saved.dev === true;
		return saved;
	} catch {
		return {};
	}
};

// Slider drags (speed, volume, orbit intensity, scrubber) fire on every input
// event, so writes are debounced into a single trailing write rather than hitting
// localStorage synchronously dozens of times per drag. pagehide flushes any
// pending state so a close or refresh mid-drag doesn't lose the last change.
let pending: Settings | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

const flush = () => {
	if (!pending) return;
	localStorage.setItem(STORAGE_KEY, JSON.stringify(pending));
	pending = null;
};

export const saveSettings = (settings: Settings) => {
	// preserve the dev flag across writes (the runtime state doesn't carry it); when
	// it's off, drop the transient playback position so the next visit starts fresh
	const next: Settings = {...settings, dev: devMode || undefined};
	if (!devMode) {
		delete next.paused;
		delete next.time;
	}
	pending = next;
	clearTimeout(timer);
	timer = setTimeout(flush, 200);
};

addEventListener("pagehide", flush);
