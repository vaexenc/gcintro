import * as THREE from "three";
import {GLTF, GLTFLoader} from "three/examples/jsm/loaders/GLTFLoader.js";
import {AudioEngine, TrackBuffers, reverseBuffer} from "./audio";
import {OrbitController} from "./orbit";
import {Player} from "./player";
import {setupScene} from "./scene";
import {loadSettings} from "./settings";
import {setupUi} from "./ui";

// GENERAL

// disable the browser context menu (right-click)
window.addEventListener("contextmenu", (event) => event.preventDefault());

const canvas = document.querySelector<HTMLCanvasElement>("canvas.webgl")!;
const scene = new THREE.Scene();
const gltfLoader = new GLTFLoader();

// RENDERER

const renderer = new THREE.WebGLRenderer({canvas: canvas, antialias: true});

const resizeRendererCanvas = (renderer: THREE.WebGLRenderer) => {
	const width = Math.min(window.innerWidth, window.innerHeight);
	const height = width;
	renderer.setSize(width, height);
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
};

window.addEventListener("resize", () => {
	resizeRendererCanvas(renderer);
});

resizeRendererCanvas(renderer);

// SOUND CONFIG

const soundNames = ["gcintro1", "gcintro2", "gcintro3"];
const trackLabels: Record<string, string> = {gcintro1: "Classic", gcintro2: "Hold Z", gcintro3: "Hold Z x4"};
// Per-track start offset (seconds)
const trackOffsets: Record<string, number> = {gcintro1: -0.1, gcintro2: -0.2, gcintro3: -0.2};

// A single context drives all audio. It's created suspended (browsers won't let it
// produce sound before a user gesture) and resumed on the start click.
const audioCtx = new (window.AudioContext ?? (window as any).webkitAudioContext)() as AudioContext;

// SCENE SETUP
// Runs once everything has been preloaded and the user has clicked to start.
// The preloaded gltf, matcap texture and per-track decoded audio are passed in.

const init = (gltf: GLTF, matcapTexture: THREE.Texture, trackBuffers: Record<string, TrackBuffers>) => {
	scene.add(gltf.scene);

	const {camera, opacityBindings, setWireframe, orbitTarget} = setupScene(gltf, matcapTexture);
	scene.add(camera);

	const uiPanel = document.querySelector<HTMLElement>(".ui")!;
	const orbit = new OrbitController(camera, canvas, uiPanel, orbitTarget);

	// ANIMATION

	const clip = gltf.animations[0];
	const mixer = new THREE.AnimationMixer(gltf.scene);
	const action = mixer.clipAction(clip);
	action.play();

	// load persisted state; sound state lives on the AudioEngine, everything else
	// (playback knobs, paused/time) is owned by the Player, which persists it all
	const saved = loadSettings();
	const audio = new AudioEngine(
		audioCtx,
		trackBuffers,
		trackOffsets,
		saved.track ?? soundNames[0],
		saved.soundEnabled ?? true,
		saved.volume ?? 1,
	);
	const player = new Player(action, mixer, clip, audio, orbit, setWireframe, saved);

	const ui = setupUi({player, soundNames, trackLabels});

	const clock = new THREE.Clock();
	let previousTime = 0;
	let frameHandle = 0;

	const tick = () => {
		const elapsedTime = clock.getElapsedTime();
		const deltaTime = elapsedTime - previousTime;
		previousTime = elapsedTime;
		player.update(deltaTime);
		orbit.update(deltaTime);

		ui.syncSeekDisplay();
		ui.updatePlayIcon();

		for (const binding of opacityBindings) {
			for (const material of binding.materials) material.opacity = binding.driver.x * binding.scale;
		}

		renderer.render(scene, camera);
		frameHandle = window.requestAnimationFrame(tick);
	};

	// Pause everything when this tab is hidden behind another tab (rAF already
	// stalls there, but the wall-clock keeps running, so a resume would lurch the
	// animation forward by the whole hidden span and leave audio out of sync).
	// document.hidden tracks tab visibility specifically — it stays false when the
	// window merely loses focus while the tab is still on screen, so a backgrounded
	// window keeps animating as before.
	document.addEventListener("visibilitychange", () => {
		if (document.hidden) {
			cancelAnimationFrame(frameHandle);
			clock.stop();
			audioCtx.suspend();
		} else {
			clock.start(); // rebase the clock so the next deltaTime is ~0
			previousTime = 0;
			audioCtx.resume();
			tick();
		}
	});

	tick();
};

// PRELOAD + LOADING SCREEN
// Fetch every asset the scene needs up front and in parallel, filling a
// progress bar as each finishes. Once all are ready we surface a "click to
// continue" prompt: starting the scene from that click gives us the user
// gesture browsers require before they'll let the soundtrack autoplay.

const loadGltf = (url: string): Promise<GLTF> =>
	new Promise((resolve, reject) => gltfLoader.load(url, resolve, undefined, reject));

const loadTexture = (url: string): Promise<THREE.Texture> =>
	new Promise((resolve, reject) => new THREE.TextureLoader().load(url, resolve, undefined, reject));

// fully decode each sound up front (forward + sample-reversed copy; see AudioEngine)
// so playback never stalls
const loadAudio = (url: string): Promise<TrackBuffers> =>
	fetch(url)
		.then((response) => response.arrayBuffer())
		.then((data) => audioCtx.decodeAudioData(data))
		.then((forward) => ({forward, reverse: reverseBuffer(audioCtx, forward)}));

const loader = document.getElementById("loader")!;
const loaderFill = document.getElementById("loaderFill")!;

const tasks: Promise<void>[] = [];
let loadedCount = 0;
const trackBuffers: Record<string, TrackBuffers> = {};
let gltf: GLTF;
let matcapTexture: THREE.Texture;

const track = <T>(promise: Promise<T>, onDone: (result: T) => void) => {
	tasks.push(
		promise.then((result) => {
			onDone(result);
			loadedCount++;
			loaderFill.style.width = Math.round((loadedCount / tasks.length) * 100) + "%";
		}),
	);
};

track(loadGltf("/models/gcintro.glb"), (result) => (gltf = result));
track(loadTexture("/images/gc_envmap_I8.png"), (result) => (matcapTexture = result));
for (const name of soundNames) {
	track(loadAudio("/sounds/" + name + ".ogg"), (buffers) => (trackBuffers[name] = buffers));
}

Promise.all(tasks).then(() => {
	loaderFill.style.width = "100%";
	loader.classList.add("ready");
	const onKey = (event: KeyboardEvent) => {
		if (event.code === "Space" || event.code === "Enter") {
			event.preventDefault();
			start();
		}
	};
	const start = () => {
		loader.removeEventListener("click", start);
		window.removeEventListener("keydown", onKey);
		loader.classList.add("hide");
		setTimeout(() => loader.remove(), 600);
		// the click/keypress is the user gesture browsers require before audio may sound
		audioCtx.resume();
		init(gltf, matcapTexture, trackBuffers);
	};
	loader.addEventListener("click", start);
	window.addEventListener("keydown", onKey);
});
