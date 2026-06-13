import * as THREE from "three";
import {AudioEngine} from "./audio";
import {OrbitController} from "./orbit";
import {PlaybackState, Settings, saveSettings} from "./settings";

const FPS = 60;
const FRAME_STEP = 1 / FPS;

// Owns the animation transport and every piece of persisted state. The UI drives
// playback purely through these methods and getters; each mutation applies to the
// right subsystem (the action, the audio engine, the orbit camera, the scene) and
// persists in one place — so the "mutate a field, then remember to apply it and
// save" dance lives nowhere else.
export class Player {
	readonly playback: PlaybackState;

	constructor(
		private action: THREE.AnimationAction,
		private mixer: THREE.AnimationMixer,
		private clip: THREE.AnimationClip,
		private audio: AudioEngine,
		private orbit: OrbitController,
		private applyWireframe: (enabled: boolean) => void,
		saved: Partial<Settings>,
	) {
		this.playback = {
			speed: saved.speed ?? 1,
			reverse: saved.reverse ?? false,
			orbit: saved.orbit ?? true,
			orbitIntensity: saved.orbitIntensity ?? 1,
			wireframe: saved.wireframe ?? false,
			loop: saved.loop ?? true,
		};

		// apply persisted settings on load
		this.applyTimeScale();
		orbit.intensity = this.playback.orbitIntensity;
		orbit.setEnabled(this.playback.orbit);
		applyWireframe(this.playback.wireframe);
		this.applyLoop();

		// drop the running audio source on loop wrap so it re-homes to the new clock
		mixer.addEventListener("loop", () => audio.restart());

		// if the animation was paused last session, restore that paused frame
		if (saved.paused) {
			action.paused = true;
			action.time = saved.time ?? 0;
			mixer.update(0);
		}
		this.save();
	}

	get paused() {
		return this.action.paused;
	}
	get time() {
		return this.action.time;
	}
	get duration() {
		return this.clip.duration;
	}
	get track() {
		return this.audio.track;
	}
	get muted() {
		return !this.audio.enabled;
	}
	get volume() {
		return this.audio.volume;
	}

	// advance the animation a frame and re-home the audio to the resulting clock
	update(deltaTime: number) {
		this.mixer.update(deltaTime);
		this.audio.sync(this.action.time, this.action.paused, this.playback.reverse, this.playback.speed);
	}

	// TRANSPORT

	play() {
		// with looping off the clip clamps at whichever end it runs into; if we're
		// sitting on the end we'd immediately play *away* from, there's nowhere to
		// go, so restart from the opposite end (e.g. reverse from the very start)
		if (!this.playback.loop) {
			if (this.playback.reverse && this.action.time <= 0) this.action.time = this.clip.duration;
			else if (!this.playback.reverse && this.action.time >= this.clip.duration) this.action.time = 0;
		}
		this.action.enabled = true;
		this.action.paused = false;
		this.mixer.update(0);
		this.audio.restart();
		this.save();
	}

	pause() {
		this.action.paused = true;
		this.save();
	}

	rewind() {
		this.action.time = 0;
		this.mixer.update(0);
		this.audio.restart();
		this.save();
	}

	// jump to an absolute clip time without touching the play/pause state; a scrub
	// or arrow-key seek exceeds the drift window, so audio re-homes on its own next
	// frame (a frame-step seek is smaller, but pauses, so it falls silent anyway)
	seekTo(time: number) {
		this.action.time = THREE.MathUtils.clamp(time, 0, this.clip.duration);
		this.mixer.update(0);
		this.save();
	}

	seekBy(delta: number) {
		this.seekTo(this.action.time + delta);
	}

	frameBack() {
		this.stepFrame(-FRAME_STEP);
	}
	frameForward() {
		this.stepFrame(FRAME_STEP);
	}

	private stepFrame(delta: number) {
		this.action.paused = true;
		this.seekBy(delta);
	}

	// SETTINGS

	setSpeed(speed: number) {
		this.playback.speed = speed;
		this.applyTimeScale();
	}

	setReverse(reverse: boolean) {
		this.playback.reverse = reverse;
		this.applyTimeScale();
	}

	setLoop(loop: boolean) {
		this.playback.loop = loop;
		this.applyLoop();
		// if looping is turned on after the clip has finished, replay from the start
		if (loop && this.action.time >= this.clip.duration) {
			this.action.reset();
			this.mixer.update(0);
			this.audio.restart();
		}
		this.save();
	}

	setOrbitEnabled(enabled: boolean) {
		this.playback.orbit = enabled;
		this.orbit.setEnabled(enabled);
		this.save();
	}

	setOrbitIntensity(intensity: number) {
		this.playback.orbitIntensity = intensity;
		this.orbit.intensity = intensity;
		this.save();
	}

	setWireframe(enabled: boolean) {
		this.playback.wireframe = enabled;
		this.applyWireframe(enabled);
		this.save();
	}

	// SOUND

	setTrack(track: string) {
		this.audio.track = track;
		this.audio.restart();
		this.save();
	}

	toggleMute() {
		this.audio.enabled = !this.audio.enabled;
		this.save();
	}

	setVolume(volume: number) {
		this.audio.volume = volume;
		this.save();
	}

	private applyTimeScale() {
		this.action.timeScale = this.playback.speed * (this.playback.reverse ? -1 : 1);
		this.save();
	}

	private applyLoop() {
		this.action.setLoop(this.playback.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
		this.action.clampWhenFinished = true;
	}

	private save() {
		const settings: Settings = {
			...this.playback,
			track: this.audio.track,
			soundEnabled: this.audio.enabled,
			volume: this.audio.volume,
			paused: this.action.paused,
			time: this.action.time,
		};
		saveSettings(settings);
	}
}
