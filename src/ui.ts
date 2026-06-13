import * as THREE from "three";
import {Player} from "./player";

// Everything the control panel needs. The Player owns playback, audio and persisted
// state; the UI just wires DOM events to its methods and reads back its getters.
export interface UiDeps {
	player: Player;
	soundNames: string[];
	trackLabels: Record<string, string>;
}

export interface UiHandles {
	updatePlayIcon: () => void;
	// keep the seek slider in sync with playback, unless the user is scrubbing
	syncSeekDisplay: () => void;
}

// a lightweight media-player control panel
export const setupUi = (deps: UiDeps): UiHandles => {
	const {player, soundNames, trackLabels} = deps;

	const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
	const formatTime = (t: number) => {
		const m = Math.floor(t / 60);
		const s = Math.floor(t % 60);
		return m + ":" + String(s).padStart(2, "0");
	};

	// paint a range input's "played" portion: --fill drives the CSS track gradient
	const paintRange = (input: HTMLInputElement) => {
		const min = parseFloat(input.min) || 0;
		const max = parseFloat(input.max) || 1;
		const pct = max > min ? ((parseFloat(input.value) - min) / (max - min)) * 100 : 0;
		input.style.setProperty("--fill", pct + "%");
	};

	// transport buttons — one button whose icon reflects the play/pause state
	const playPath = $("playPath");
	const PLAY_D = "M8 5v14l11-7z";
	const PAUSE_D = "M7 5h4v14H7zM13 5h4v14h-4z";
	const updatePlayIcon = () => {
		playPath.setAttribute("d", player.paused ? PLAY_D : PAUSE_D);
	};
	const togglePlay = () => {
		if (player.paused) player.play();
		else player.pause();
		updatePlayIcon();
	};
	$("playPause").addEventListener("click", togglePlay);
	$("rewind").addEventListener("click", () => player.rewind());
	$("frameBack").addEventListener("click", () => {
		player.frameBack();
		updatePlayIcon();
	});
	$("frameForward").addEventListener("click", () => {
		player.frameForward();
		updatePlayIcon();
	});

	// flip a checkbox and fire its change handler, so the keyboard path reuses the
	// canonical toggle logic in bindToggle and the on-screen control stays in sync
	const toggleCheckbox = (id: string) => {
		const input = $<HTMLInputElement>(id);
		input.checked = !input.checked;
		input.dispatchEvent(new Event("change"));
	};

	// keyboard shortcuts
	window.addEventListener("keydown", (event) => {
		if (event.target instanceof HTMLElement && /^(INPUT|SELECT|TEXTAREA)$/.test(event.target.tagName)) return;
		// YouTube-style number seeking: N jumps to N/10 of the duration (0 = start)
		const digit = event.code.match(/^(?:Digit|Numpad)(\d)$/);
		if (digit) {
			event.preventDefault();
			player.seekTo(player.duration * (parseInt(digit[1]) / 10));
			return;
		}
		// cases are grouped to match the on-screen shortcut list: transport,
		// seek (number seeking is handled above), playback, audio, view, panels
		switch (event.code) {
			// transport
			case "Space":
				event.preventDefault();
				togglePlay();
				break;
			case "KeyR":
			case "Home":
				event.preventDefault();
				player.rewind();
				break;
			case "End":
				event.preventDefault();
				player.seekTo(player.duration);
				break;
			// seek
			case "ArrowLeft":
				event.preventDefault();
				player.seekBy(-0.5);
				break;
			case "ArrowRight":
				event.preventDefault();
				player.seekBy(0.5);
				break;
			case "Comma":
				event.preventDefault();
				player.frameBack();
				updatePlayIcon();
				break;
			case "Period":
				event.preventDefault();
				player.frameForward();
				updatePlayIcon();
				break;
			// playback
			case "KeyA":
				event.preventDefault();
				stepSpeed(-1);
				break;
			case "KeyD":
				event.preventDefault();
				stepSpeed(1);
				break;
			case "KeyB":
				toggleCheckbox("reverse");
				break;
			case "KeyL":
				toggleCheckbox("loop");
				break;
			// audio
			case "KeyQ":
				stepTrack(-1);
				break;
			case "KeyE":
				stepTrack(1);
				break;
			case "ArrowUp":
				event.preventDefault();
				changeVolume(0.05);
				break;
			case "ArrowDown":
				event.preventDefault();
				changeVolume(-0.05);
				break;
			case "KeyM":
				toggleMute();
				break;
			// view
			case "KeyO":
				toggleCheckbox("orbit");
				break;
			case "KeyW":
				toggleCheckbox("wireframe");
				break;
			// panels
			case "KeyS":
				setSettingsOpen(!!settingsPanel.hidden);
				break;
			case "KeyI":
				setInfoOpen(!!infoPanel.hidden);
				break;
		}
	});

	// scrubbing: drag sets the clip time directly; while dragging we suppress the
	// per-frame display sync (below) so the playhead doesn't fight the cursor
	let seeking = false;
	const seekInput = $<HTMLInputElement>("seek");
	const timeCurrent = $("timeCurrent");
	seekInput.max = String(player.duration);
	seekInput.value = String(player.time);
	paintRange(seekInput);
	timeCurrent.textContent = formatTime(player.time);
	seekInput.addEventListener("input", () => {
		player.seekTo(parseFloat(seekInput.value));
		timeCurrent.textContent = formatTime(player.time);
		paintRange(seekInput);
	});
	seekInput.addEventListener("pointerdown", () => (seeking = true));
	window.addEventListener("pointerup", () => {
		seeking = false;
		// native controls (sliders, buttons) keep keyboard focus after a click and
		// then swallow our arrow/space shortcuts; hand focus back to the document
		// once the interaction is over
		const focused = document.activeElement;
		if (focused instanceof HTMLElement && focused !== document.body && /^(INPUT|BUTTON)$/.test(focused.tagName)) {
			focused.blur();
		}
	});

	const syncSeekDisplay = () => {
		if (seeking) return;
		seekInput.value = String(player.time);
		paintRange(seekInput);
		timeCurrent.textContent = formatTime(player.time);
	};

	// sliders with a live value readout; returns an applier that writes a value to
	// the slider, repaints, updates the readout and runs onInput — shared by the
	// input handler, the reset button and any programmatic setter (e.g. the keys)
	const bindSlider = (
		id: string,
		initial: number,
		defaultValue: number,
		format: (value: number) => string,
		onInput: (value: number) => void,
	) => {
		const input = $<HTMLInputElement>(id);
		const out = $(id + "Val");
		const apply = (value: number) => {
			input.value = String(value);
			out.textContent = format(value);
			paintRange(input);
			onInput(value);
		};
		// initial paint only — don't fire onInput, the value is already applied
		input.value = String(initial);
		out.textContent = format(initial);
		paintRange(input);
		input.addEventListener("input", () => apply(parseFloat(input.value)));
		// reset button restores the default value and applies it
		$(id + "Reset").addEventListener("click", () => apply(defaultValue));
		return apply;
	};
	const setSpeed = bindSlider(
		"speed",
		player.playback.speed,
		1,
		(v) => v.toFixed(2) + "×",
		(v) => player.setSpeed(v),
	);
	bindSlider(
		"orbitIntensity",
		player.playback.orbitIntensity,
		1,
		(v) => v.toFixed(1),
		(v) => player.setOrbitIntensity(v),
	);

	// toggles
	const bindToggle = (id: string, initial: boolean, onChange: (on: boolean) => void) => {
		const input = $<HTMLInputElement>(id);
		input.checked = initial;
		input.addEventListener("change", () => onChange(input.checked));
	};
	bindToggle("reverse", player.playback.reverse, (on) => player.setReverse(on));
	bindToggle("loop", player.playback.loop, (on) => {
		player.setLoop(on);
		// setLoop may replay from the start when re-enabled at the clip's end
		updatePlayIcon();
	});
	bindToggle("orbit", player.playback.orbit, (on) => player.setOrbitEnabled(on));
	bindToggle("wireframe", player.playback.wireframe, (on) => player.setWireframe(on));

	// mute button + volume slider (main bar)
	const mutePath = $("mutePath");
	const VOL_ON_D =
		"M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z";
	const VOL_OFF_D =
		"M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z";
	const updateMuteIcon = () => {
		mutePath.setAttribute("d", player.muted ? VOL_OFF_D : VOL_ON_D);
	};
	const toggleMute = () => {
		player.toggleMute();
		updateMuteIcon();
	};
	$("muteToggle").addEventListener("click", toggleMute);
	updateMuteIcon();

	const volumeInput = $<HTMLInputElement>("volume");
	volumeInput.value = String(player.volume);
	paintRange(volumeInput);
	volumeInput.addEventListener("input", () => {
		player.setVolume(parseFloat(volumeInput.value));
		paintRange(volumeInput);
	});

	// shared by the slider and the up/down arrow keys
	const changeVolume = (delta: number) => {
		const volume = THREE.MathUtils.clamp(player.volume + delta, 0, 1);
		player.setVolume(volume);
		volumeInput.value = String(volume);
		paintRange(volumeInput);
	};

	// A/D jump to the nearest 1/8× step in the given direction, snapping any
	// off-grid value the slider may have set; clamps to one step .. 5×
	const SPEED_STEP = 0.125;
	const stepSpeed = (dir: number) => {
		const steps = player.playback.speed / SPEED_STEP;
		const next = dir > 0 ? Math.floor(steps) + 1 : Math.ceil(steps) - 1;
		setSpeed(THREE.MathUtils.clamp(next * SPEED_STEP, SPEED_STEP, 4));
	};

	// sound track dropdown
	const trackSelect = $<HTMLSelectElement>("track");
	for (const name of soundNames) {
		const option = document.createElement("option");
		option.value = name;
		option.textContent = trackLabels[name] ?? name;
		trackSelect.appendChild(option);
	}
	trackSelect.value = player.track;
	const setTrack = (name: string) => {
		player.setTrack(name);
		trackSelect.value = name;
	};
	// Q/E cycle to the previous/next track, wrapping around
	const stepTrack = (dir: number) => {
		const i = soundNames.indexOf(player.track);
		setTrack(soundNames[(i + dir + soundNames.length) % soundNames.length]);
	};
	trackSelect.addEventListener("change", () => {
		setTrack(trackSelect.value);
		// the dropdown has closed by now; hand focus back so keyboard shortcuts work
		trackSelect.blur();
	});

	// settings drawer + info panel, sharing one open-at-a-time drawer pattern
	const settingsPanel = $("settings");
	const settingsToggle = $("settingsToggle");
	const infoPanel = $("info");
	const infoToggle = $("infoToggle");
	const setSettingsOpen = (open: boolean) => {
		settingsPanel.hidden = !open;
		settingsToggle.setAttribute("aria-expanded", String(open));
		if (open) setInfoOpen(false);
		wakeUi();
	};
	const setInfoOpen = (open: boolean) => {
		infoPanel.hidden = !open;
		infoToggle.setAttribute("aria-expanded", String(open));
		if (open) setSettingsOpen(false);
		wakeUi();
	};
	settingsToggle.addEventListener("click", () => setSettingsOpen(!!settingsPanel.hidden));
	infoToggle.addEventListener("click", () => setInfoOpen(!!infoPanel.hidden));
	// clicking outside an open drawer (and its toggle) closes it
	document.addEventListener("pointerdown", (event) => {
		const target = event.target;
		if (!(target instanceof Node)) return;
		const insideSettings = settingsPanel.contains(target) || settingsToggle.contains(target);
		const insideHelp = infoPanel.contains(target) || infoToggle.contains(target);
		if (!settingsPanel.hidden && !insideSettings) setSettingsOpen(false);
		if (!infoPanel.hidden && !insideHelp) setInfoOpen(false);
	});

	updatePlayIcon();

	// fade the panel away when the pointer is idle, reveal it on movement
	const ui = $("ui");
	let idleTimer: ReturnType<typeof setTimeout>;
	const wakeUi = () => {
		ui.classList.remove("idle");
		clearTimeout(idleTimer);
		idleTimer = setTimeout(() => {
			if (settingsPanel.hidden && infoPanel.hidden) ui.classList.add("idle");
		}, 2600);
	};
	window.addEventListener("mousemove", wakeUi);
	ui.addEventListener("pointerdown", wakeUi);

	return {updatePlayIcon, syncSeekDisplay};
};
