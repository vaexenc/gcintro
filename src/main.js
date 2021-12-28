import "./style.css";
import * as THREE from "three";
// import * as dat from "dat.gui"
import {GLTFLoader} from "three/examples/jsm/loaders/GLTFLoader.js";

// GENERAL

const canvas = document.querySelector("canvas.webgl");
const scene = new THREE.Scene();
const gltfLoader = new GLTFLoader();
// const gui = new dat.GUI();
const ambientLight = new THREE.AmbientLight();
scene.add(ambientLight);

// RENDERER

const renderer = new THREE.WebGLRenderer({canvas: canvas, antialias: true});

const resizeRendererCanvas = (renderer) => {
	const width = Math.min(window.innerWidth, window.innerHeight);
	const height = width;
	renderer.setSize(width, height);
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
};

window.addEventListener("resize", () => {
	resizeRendererCanvas(renderer);
});

resizeRendererCanvas(renderer);

// LOAD BLENDER FILE

gltfLoader.load("/models/gcintro.glb", (gltf) => {
	scene.add(gltf.scene);

	// CAMERA

	const camera = gltf.cameras[0];
	camera.zoom = 1.8;
	camera.updateProjectionMatrix();

	const {x: originalRotationX, y: originalRotationY} = camera.rotation;

	const tiltCamera = (event) => {
		const rotationMaxAmount = 0.15;
		const rotationAmountMultiplierX = (event.x / window.innerWidth - 0.5) * 2;
		const rotationAmountMultiplierY = (event.y / window.innerHeight - 0.5) * 2;
		camera.rotation.x = originalRotationX - rotationAmountMultiplierY * rotationMaxAmount;
		camera.rotation.y = originalRotationY - rotationAmountMultiplierX * rotationMaxAmount;
	};

	window.addEventListener("mousemove", tiltCamera);

	// MATERIALS

	const bigCube = gltf.scene.getObjectByName("bigCube");
	const envImage = bigCube.material.map.image;
	const envTexture = new THREE.CubeTexture([envImage, envImage, envImage, envImage, envImage, envImage]);
	envTexture.needsUpdate = true;

	const movingCube = gltf.scene.getObjectByName("movingCube");
	movingCube.material = new THREE.MeshStandardMaterial({color: 0x6350bb});
	movingCube.material.transparent = true;
	movingCube.material.envMap = envTexture;
	movingCube.material.roughness = 0.25;
	movingCube.material.metalness = 0;
	movingCube.material.polygonOffset = true;
	movingCube.material.polygonOffsetFactor = -150;
	const movingCubePair = {
		material: movingCube.material,
		position: gltf.scene.getObjectByName("movingCubeOpacity").position
	};

	bigCube.material = new THREE.MeshBasicMaterial({side: THREE.DoubleSide});
	bigCube.material.transparent = true;
	bigCube.material.envMap = envTexture;
	const bigCubePair = {
		material: bigCube.material,
		position: gltf.scene.getObjectByName("bigCubeOpacity").position
	};

	const trailPairs = [];
	for (let i = 0; i < 15; i++) {
		const trailObj = gltf.scene.getObjectByName("trail" + i);
		trailObj.renderOrder = 1000;
		trailObj.position.x += -0.01;
		trailObj.position.y += 0.01;
		trailObj.position.z += 0.01;
		trailObj.material = new THREE.MeshBasicMaterial({color: 0x6350bb, side: THREE.DoubleSide});
		trailObj.material.transparent = true;
		trailPairs.push({
			material: trailObj.material,
			position: gltf.scene.getObjectByName("trail" + i + "Opacity").position
		});
	}

	const gamecubePairs = [];
	for (let i = 0; i < 5; i++) {
		const gamecubeObj = gltf.scene.getObjectByName("gamecube" + i);
		gamecubeObj.renderOrder = 2000;
		gamecubeObj.material = new THREE.MeshBasicMaterial();
		gamecubeObj.material.transparent = true;
		gamecubePairs.push({
			material: gamecubeObj.material,
			position: gltf.scene.getObjectByName("gamecube" + i + "Opacity").position
		});
	}

	const nintendoPairs = [];
	for (let i = 0; i < 8; i++) {
		const nintendoObj = gltf.scene.getObjectByName("nintendo" + i);
		nintendoObj.children[0].material = new THREE.MeshBasicMaterial({color: 0x373737});
		nintendoObj.children[0].material.transparent = true;
		nintendoObj.children[1].material = new THREE.MeshBasicMaterial({color: 0x666666});
		nintendoObj.children[1].material.transparent = true;
		nintendoPairs.push({
			material1: nintendoObj.children[0].material,
			material2: nintendoObj.children[1].material,
			position: gltf.scene.getObjectByName("nintendo" + i + "Opacity").position
		});
	}

	gltf.scene.getObjectByName("x").material.transparent = true;
	gltf.scene.getObjectByName("y").material.transparent = true;
	gltf.scene.getObjectByName("z").material.transparent = true;
	const xyzPair = {
		xMaterial: gltf.scene.getObjectByName("x").material,
		yMaterial: gltf.scene.getObjectByName("y").material,
		zMaterial: gltf.scene.getObjectByName("z").material,
		position: gltf.scene.getObjectByName("xyzOpacity").position
	};

	xyzPair.xMaterial.map.encoding = THREE.LinearEncoding;
	xyzPair.yMaterial.map.encoding = THREE.LinearEncoding;
	xyzPair.zMaterial.map.encoding = THREE.LinearEncoding;

	// ANIMATION

	const mixer = new THREE.AnimationMixer(gltf.scene);
	const action = mixer.clipAction(gltf.animations[0]);
	action.play();

	const clock = new THREE.Clock();
	let previousTime = 0;

	const tick = () => {
		const elapsedTime = clock.getElapsedTime();
		const deltaTime = elapsedTime - previousTime;
		previousTime = elapsedTime;
		mixer.update(deltaTime);

		movingCubePair.material.opacity = movingCubePair.position.x;
		bigCubePair.material.opacity = bigCubePair.position.x * 0.5;

		for (const pair of trailPairs) {
			pair.material.opacity = pair.position.x;
		}

		for (const pair of gamecubePairs) {
			pair.material.opacity = pair.position.x;
		}

		for (const pair of nintendoPairs) {
			pair.material1.opacity = pair.position.x;
			pair.material2.opacity = pair.position.x;
		}

		xyzPair.xMaterial.opacity = xyzPair.position.x;
		xyzPair.yMaterial.opacity = xyzPair.position.x;
		xyzPair.zMaterial.opacity = xyzPair.position.x;

		renderer.render(scene, camera);
		window.requestAnimationFrame(tick);
	};

	tick();
});
