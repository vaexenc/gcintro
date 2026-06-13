import * as THREE from "three";

// Orbit is expressed as yaw/pitch rotations relative to the default camera, so the
// neutral angle (0, 0) reproduces the default view exactly. The controller installs
// its own pointer/touch listeners and eases the camera toward the target angle.
export class OrbitController {
	enabled = false;
	intensity = 1;

	private targetYaw = 0;
	private targetPitch = 0;
	private currentYaw = 0;
	private currentPitch = 0;

	private readonly smoothing = 8;
	private readonly worldUp = new THREE.Vector3(0, 1, 0);
	private readonly rightAxis: THREE.Vector3;
	private readonly baseOffset: THREE.Vector3;
	// remember the default camera state so we can revert to it
	private readonly defaultPosition: THREE.Vector3;
	private readonly defaultQuaternion: THREE.Quaternion;

	private touchOrbiting = false;
	private touchStartX = 0;
	private touchStartY = 0;
	// touch interactions synthesize trailing mouse events; this stamps the last
	// touch so the absolute-position parallax below can ignore that phantom burst
	private lastTouchTime = 0;

	constructor(
		private camera: THREE.Camera,
		canvas: HTMLCanvasElement,
		// the panel sits in the bottom-left corner; the panel itself plus the gap
		// between it and the viewport edges is a dead zone that returns the camera to
		// its default view
		private uiPanel: HTMLElement,
		// pivot orbiting around the centre of the big cube
		private orbitTarget: THREE.Vector3,
	) {
		this.defaultPosition = camera.position.clone();
		this.defaultQuaternion = camera.quaternion.clone();
		this.rightAxis = new THREE.Vector3(1, 0, 0).applyQuaternion(this.defaultQuaternion).normalize();
		this.baseOffset = new THREE.Vector3().subVectors(this.defaultPosition, orbitTarget);

		window.addEventListener("mousemove", this.onMouseMove);
		// when the cursor leaves the window or the window loses focus, ease the
		// camera back to its default view
		document.addEventListener("mouseleave", this.resetTarget);
		window.addEventListener("blur", this.resetTarget);
		// touch devices have no hover, so the pointer-position parallax never fires.
		// Instead, drag a finger across the scene to orbit and ease back to the default
		// view when it lifts. The angle tracks the drag *distance* from where the touch
		// began (not the absolute position), so the camera doesn't jump to wherever the
		// finger first lands. Listening on the canvas keeps the UI panel a natural dead
		// zone — touches on its controls never reach here.
		canvas.addEventListener("touchstart", this.onTouchStart, {passive: true});
		canvas.addEventListener("touchmove", this.onTouchMove, {passive: false});
		canvas.addEventListener("touchend", this.onTouchEnd);
		canvas.addEventListener("touchcancel", this.onTouchEnd);
	}

	setEnabled(enabled: boolean) {
		this.enabled = enabled;
		// always revert the camera to its default state when toggling
		this.targetYaw = this.targetPitch = this.currentYaw = this.currentPitch = 0;
		this.camera.position.copy(this.defaultPosition);
		this.camera.quaternion.copy(this.defaultQuaternion);
	}

	update(deltaTime: number) {
		if (!this.enabled) return;
		const ease = 1 - Math.exp(-deltaTime * this.smoothing);
		this.currentYaw += (this.targetYaw - this.currentYaw) * ease;
		this.currentPitch += (this.targetPitch - this.currentPitch) * ease;
		const rotation = new THREE.Quaternion()
			.setFromAxisAngle(this.worldUp, this.currentYaw)
			.multiply(new THREE.Quaternion().setFromAxisAngle(this.rightAxis, this.currentPitch));
		this.camera.position.copy(this.orbitTarget).add(this.baseOffset.clone().applyQuaternion(rotation));
		this.camera.quaternion.copy(rotation).multiply(this.defaultQuaternion);
	}

	private resetTarget = () => {
		this.targetYaw = 0;
		this.targetPitch = 0;
	};

	// map a normalized [-1, 1] orbit amount onto the yaw/pitch target angles
	private setTargetFromAmount(amountX: number, amountY: number) {
		this.targetYaw = -amountX * Math.PI * 0.05 * this.intensity;
		this.targetPitch = -amountY * Math.PI * 0.035 * this.intensity;
	}

	private onMouseMove = (event: MouseEvent) => {
		if (!this.enabled || performance.now() - this.lastTouchTime < 700) return;
		const rect = this.uiPanel.getBoundingClientRect();
		if (event.clientX <= rect.right && event.clientY >= rect.top) {
			this.resetTarget();
			return;
		}
		const amountX = (event.x / window.innerWidth - 0.5) * 2;
		const amountY = (event.y / window.innerHeight - 0.5) * 2;
		this.setTargetFromAmount(amountX, amountY);
	};

	private onTouchStart = (event: TouchEvent) => {
		if (!this.enabled || event.touches.length !== 1) return;
		this.touchOrbiting = true;
		this.lastTouchTime = performance.now();
		this.touchStartX = event.touches[0].clientX;
		this.touchStartY = event.touches[0].clientY;
	};

	private onTouchMove = (event: TouchEvent) => {
		if (!this.enabled || !this.touchOrbiting || event.touches.length !== 1) return;
		// keep the page from scrolling/zooming while orbiting
		event.preventDefault();
		// a half-screen drag spans the full range; clamp so it can't overshoot
		const amountX = THREE.MathUtils.clamp(
			((event.touches[0].clientX - this.touchStartX) / window.innerWidth) * 2,
			-1,
			1,
		);
		const amountY = THREE.MathUtils.clamp(
			((event.touches[0].clientY - this.touchStartY) / window.innerHeight) * 2,
			-1,
			1,
		);
		this.setTargetFromAmount(amountX, amountY);
	};

	private onTouchEnd = () => {
		this.lastTouchTime = performance.now();
		if (!this.touchOrbiting) return;
		this.touchOrbiting = false;
		this.resetTarget();
	};
}
