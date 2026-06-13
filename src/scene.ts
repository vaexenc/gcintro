import * as THREE from "three";
import {GLTF} from "three/examples/jsm/loaders/GLTFLoader.js";

// Each animated mesh group is faded by an authoring "...Opacity" empty whose x
// position drives the material opacity (scaled, for the big cube). One shape covers
// every group; the tick loop walks the list.
export type OpacityBinding = {materials: THREE.Material[]; driver: THREE.Vector3; scale: number};

export interface SceneSetup {
	// the glb's authored camera, flattened into world space (see below)
	camera: THREE.Camera;
	opacityBindings: OpacityBinding[];
	setWireframe: (enabled: boolean) => void;
	// pivot orbiting around the centre of the big cube
	orbitTarget: THREE.Vector3;
}

export const setupScene = (gltf: GLTF, matcapTexture: THREE.Texture): SceneSetup => {
	// the camera flatten and the bounding box below read world transforms, so bake
	// the authored hierarchy's matrices first
	gltf.scene.updateMatrixWorld(true);

	// look an object up by name; the scene authoring guarantees these all exist
	const obj = (name: string): THREE.Object3D => gltf.scene.getObjectByName(name)!;
	const asMesh = (node: THREE.Object3D | undefined): THREE.Mesh => {
		if (node instanceof THREE.Mesh) return node;
		throw new Error(`expected a mesh, got ${node?.type ?? "nothing"}`);
	};
	const mesh = (name: string): THREE.Mesh => asMesh(gltf.scene.getObjectByName(name));
	// the glb keeps a single material per mesh; it carries a texture map (.map),
	// which only the concrete material subclasses expose — hence the assertion
	const material = (name: string): THREE.MeshBasicMaterial => mesh(name).material as THREE.MeshBasicMaterial;

	const opacityBindings: OpacityBinding[] = [];
	const bindOpacity = (driverName: string, materials: THREE.Material[], scale = 1) =>
		opacityBindings.push({materials, driver: obj(driverName).position, scale});

	// MATERIALS

	const bigCube = mesh("bigCube");
	const envImage = material("bigCube").map!.image;
	const envTexture = new THREE.CubeTexture([envImage, envImage, envImage, envImage, envImage, envImage]);
	envTexture.needsUpdate = true;

	// The moving cube uses a view-space-normal matcap over an I8 env map, shaded by
	// one TEV-style stage: clamp(mix(C1, C0, env) * 2).
	matcapTexture.wrapS = THREE.RepeatWrapping;
	matcapTexture.wrapT = THREE.RepeatWrapping;

	// GX TEV color registers + output shift recovered from the capture
	const gxColorHi = {value: new THREE.Color(95 / 255, 80 / 255, 190 / 255)}; // C0, env=1
	const gxColorLo = {value: new THREE.Color(30 / 255, 20 / 255, 60 / 255)}; // C1, env=0
	const gxScale = {value: 2}; // GX_CS_SCALE_2

	// recovered constant env-map projection (texmtx de-rotated): uv = n.xy*scale + bias
	const texScale = {value: 0.5};
	const texBias = {value: new THREE.Vector2(-0.21, 0.38)};

	const movingCube = mesh("movingCube");
	const movingMaterial = new THREE.MeshMatcapMaterial({matcap: matcapTexture});
	movingMaterial.transparent = true;
	movingMaterial.polygonOffset = true;
	movingMaterial.polygonOffsetFactor = -150;
	movingMaterial.onBeforeCompile = (shader) => {
		shader.uniforms.uGxLo = gxColorLo;
		shader.uniforms.uGxHi = gxColorHi;
		shader.uniforms.uGxScale = gxScale;
		shader.uniforms.uTexScale = texScale;
		shader.uniforms.uTexBias = texBias;
		shader.fragmentShader =
			"uniform vec3 uGxLo;\nuniform vec3 uGxHi;\nuniform float uGxScale;\nuniform float uTexScale;\nuniform vec2 uTexBias;\n" +
			shader.fragmentShader
				.replace(
					"vec2 uv = vec2( dot( x, normal ), dot( y, normal ) ) * 0.495 + 0.5;",
					"vec2 uv = vec2( normal.x, normal.y ) * uTexScale + uTexBias;",
				)
				.replace(
					"vec3 outgoingLight = diffuseColor.rgb * matcapColor.rgb;",
					"vec3 outgoingLight = clamp( mix( uGxLo, uGxHi, matcapColor.r ) * uGxScale, 0.0, 1.0 );",
				);
	};
	movingCube.material = movingMaterial;
	bindOpacity("movingCubeOpacity", [movingMaterial]);

	const bigMaterial = new THREE.MeshBasicMaterial({side: THREE.DoubleSide});
	bigMaterial.transparent = true;
	bigMaterial.envMap = envTexture;
	bigCube.material = bigMaterial;
	bindOpacity("bigCubeOpacity", [bigMaterial], 0.5);

	for (let i = 0; i < 15; i++) {
		const trailObj = mesh("trail" + i);
		trailObj.renderOrder = 1000;
		trailObj.position.x += -0.01;
		trailObj.position.y += 0.01;
		trailObj.position.z += 0.01;
		const trailMaterial = new THREE.MeshBasicMaterial({color: 0x6350bb, side: THREE.DoubleSide});
		trailMaterial.transparent = true;
		trailObj.material = trailMaterial;
		bindOpacity("trail" + i + "Opacity", [trailMaterial]);
	}

	for (let i = 0; i < 5; i++) {
		const gamecubeObj = mesh("gamecube" + i);
		gamecubeObj.renderOrder = 2000;
		const gamecubeMaterial = new THREE.MeshBasicMaterial();
		gamecubeMaterial.transparent = true;
		gamecubeObj.material = gamecubeMaterial;
		bindOpacity("gamecube" + i + "Opacity", [gamecubeMaterial]);
	}

	for (let i = 0; i < 8; i++) {
		const nintendoObj = obj("nintendo" + i);
		const nintendoFront = asMesh(nintendoObj.children[0]);
		const nintendoBack = asMesh(nintendoObj.children[1]);
		const material1 = new THREE.MeshBasicMaterial({color: 0x373737});
		material1.transparent = true;
		nintendoFront.material = material1;
		const material2 = new THREE.MeshBasicMaterial({color: 0x666666});
		material2.transparent = true;
		nintendoBack.material = material2;
		bindOpacity("nintendo" + i + "Opacity", [material1, material2]);
	}

	// Transparent materials default to depthWrite:true, so even at opacity 0 these
	// letters still write the depth buffer and can occlude the bigCube behind them.
	// Since they share renderOrder 0 with bigCube, the transparent back-to-front sort
	// flips with the camera and the occlusion shows up intermittently (notably in
	// Chrome, whose sort tie-breaking differs). Disabling depthWrite stops them from
	// clipping the cube.
	const xyzMaterials = ["x", "y", "z"].map((name) => {
		const letterMaterial = material(name);
		letterMaterial.transparent = true;
		letterMaterial.depthWrite = false;
		letterMaterial.map!.encoding = THREE.LinearEncoding;
		return letterMaterial;
	});
	bindOpacity("xyzOpacity", xyzMaterials);

	const setWireframe = (enabled: boolean) => {
		gltf.scene.traverse((node) => {
			if (node instanceof THREE.Mesh) (node.material as THREE.MeshBasicMaterial).wireframe = enabled;
		});
	};

	const orbitTarget = new THREE.Box3().setFromObject(obj("bigCube")).getCenter(new THREE.Vector3());

	// CAMERA
	// The glb authors the camera inside the rig. Detach it and bake its world
	// transform into its (now parentless) local transform, so the orbit math can
	// treat position/quaternion as world coordinates.
	const camera = gltf.cameras[0];
	if (!(camera instanceof THREE.PerspectiveCamera || camera instanceof THREE.OrthographicCamera)) {
		throw new Error("expected a perspective or orthographic camera in the glb");
	}
	camera.zoom = 1.8;
	camera.updateProjectionMatrix();
	const worldPosition = camera.getWorldPosition(new THREE.Vector3());
	const worldQuaternion = camera.getWorldQuaternion(new THREE.Quaternion());
	camera.parent?.remove(camera);
	camera.position.copy(worldPosition);
	camera.quaternion.copy(worldQuaternion);

	return {camera, opacityBindings, setWireframe, orbitTarget};
};
