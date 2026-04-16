"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import type { CharacterControls } from "@/hooks/useCharacterControls";

const TWO_PI = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);

type CameraBasis = {
  controls: CharacterControls;
  forward: THREE.Vector3;
  right: THREE.Vector3;
  yaw: number;
};

type CharacterCameraProps = {
  characterPositionRef: React.MutableRefObject<THREE.Vector3>;
  characterRotationRef: React.MutableRefObject<number>;
  cameraBasisRef: React.MutableRefObject<CameraBasis>;
  distance?: number;
  height?: number;
  targetOffset?: { x: number; y: number; z: number };
  smoothness?: number;
  rotationSmoothness?: number;
  mouseSensitivity?: number;
  maxPolarAngle?: number;
  minPolarAngle?: number;
  autoFollowThreshold?: number;
  autoFollowSpeed?: number;
  autoRecenterDelay?: number;
};

const dampingFactor = (rate: number, delta: number) => {
  if (rate <= 0) return 0;
  const clampedRate = Math.min(rate, 0.999);
  return 1 - Math.pow(1 - clampedRate, delta * 60);
};

const wrapAngle = (angle: number) =>
  angle - TWO_PI * Math.floor((angle + Math.PI) / TWO_PI);

const shortestAngleStep = (
  current: number,
  target: number,
  factor: number
) => {
  const diff =
    THREE.MathUtils.euclideanModulo(target - current + Math.PI, TWO_PI) -
    Math.PI;
  return current + diff * factor;
};

export function CharacterCamera({
  characterPositionRef,
  characterRotationRef,
  cameraBasisRef,
  distance = 4.8,
  height = 2.4,
  targetOffset = { x: 0, y: 1.2, z: 0 },
  smoothness = 0.16,
  rotationSmoothness = 0.22,
  mouseSensitivity = 0.003,
  maxPolarAngle = Math.PI / 2.2,
  minPolarAngle = -Math.PI / 3.2,
  autoFollowThreshold = Math.PI / 10,
  autoFollowSpeed = 2.6,
  autoRecenterDelay = 0.35,
}: CharacterCameraProps) {
  const { camera, gl } = useThree();

  const pointerState = useRef({
    isOrbiting: false,
    mouseMovement: { x: 0, y: 0 },
  });
  const initState = useRef(false);
  const lastManualInput = useRef(-Infinity);

  const targetOffsetVector = useMemo(
    () => new THREE.Vector3(targetOffset.x, targetOffset.y, targetOffset.z),
    [targetOffset.x, targetOffset.y, targetOffset.z]
  );

  const baseRadius = useRef(distance);
  const basePhi = useRef(Math.PI / 3);
  const spherical = useRef(new THREE.Spherical(distance, Math.PI / 3, 0));
  const sphericalTarget = useRef(new THREE.Spherical(distance, Math.PI / 3, 0));

  const anchorTarget = useRef(new THREE.Vector3());
  const smoothedAnchor = useRef(new THREE.Vector3());
  const smoothedCameraPosition = useRef(new THREE.Vector3());
  const lookTarget = useRef(new THREE.Vector3());

  const tempDesired = useRef(new THREE.Vector3());
  const tempOffset = useRef(new THREE.Vector3());
  const tempForward = useRef(new THREE.Vector3());
  const tempRight = useRef(new THREE.Vector3());

  useEffect(() => {
    const canvas = gl.domElement;

    const handleMouseDown = (event: MouseEvent) => {
      if (event.button === 0 || event.button === 2) {
        pointerState.current.isOrbiting = true;
        lastManualInput.current = performance.now() / 1000;
        event.preventDefault();
      }
    };

    const handleMouseMove = (event: MouseEvent) => {
      if (!pointerState.current.isOrbiting) return;
      pointerState.current.mouseMovement.x += event.movementX;
      pointerState.current.mouseMovement.y += event.movementY;
    };

    const handleMouseUp = () => {
      pointerState.current.isOrbiting = false;
    };

    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };

    canvas.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    canvas.addEventListener("contextmenu", handleContextMenu);

    return () => {
      canvas.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      canvas.removeEventListener("contextmenu", handleContextMenu);
    };
  }, [gl]);

  const initialiseCamera = (characterPosition: THREE.Vector3, rotation: number) => {
    const baseVector = new THREE.Vector3(0, height, distance);
    const radius = baseVector.length() || 1;
    const derivedPhi = Math.acos(
      THREE.MathUtils.clamp(baseVector.y / radius, -1, 1)
    );

    baseRadius.current = radius;
    basePhi.current = derivedPhi;

    const theta = rotation + Math.PI;
    spherical.current.set(radius, derivedPhi, theta);
    sphericalTarget.current.copy(spherical.current);

    const desiredAnchor = tempDesired.current
      .copy(characterPosition)
      .add(targetOffsetVector);
    anchorTarget.current.copy(desiredAnchor);
    smoothedAnchor.current.copy(desiredAnchor);
    lookTarget.current.copy(desiredAnchor);

    const offset = tempOffset.current.setFromSpherical(spherical.current);
    smoothedCameraPosition.current.copy(desiredAnchor).add(offset);

    initState.current = true;
  };

  useFrame((_, delta) => {
    const characterPosition = characterPositionRef.current;
    const characterRotation = characterRotationRef.current;

    if (!initState.current) {
      initialiseCamera(characterPosition, characterRotation);
    }

    const pointer = pointerState.current;
    if (pointer.isOrbiting) {
      const { x, y } = pointer.mouseMovement;
      if (x !== 0 || y !== 0) {
        sphericalTarget.current.theta = wrapAngle(
          sphericalTarget.current.theta - x * mouseSensitivity
        );
        sphericalTarget.current.phi = THREE.MathUtils.clamp(
          sphericalTarget.current.phi - y * mouseSensitivity,
          Math.PI / 2 + minPolarAngle,
          Math.PI / 2 + maxPolarAngle
        );
        pointer.mouseMovement.x = 0;
        pointer.mouseMovement.y = 0;
        lastManualInput.current = performance.now() / 1000;
      }
    }

    const manualHold =
      performance.now() / 1000 - lastManualInput.current < autoRecenterDelay;
    const controls = cameraBasisRef.current.controls;
    const isMoving =
      controls.forward ||
      controls.backward ||
      controls.strafeLeft ||
      controls.strafeRight;

    if (!pointer.isOrbiting && !manualHold) {
      const desiredTheta = wrapAngle(characterRotation + Math.PI);
      const diff =
        THREE.MathUtils.euclideanModulo(
          desiredTheta - sphericalTarget.current.theta + Math.PI,
          TWO_PI
        ) - Math.PI;

      if (Math.abs(diff) > autoFollowThreshold) {
        const step = Math.sign(diff) * Math.min(Math.abs(diff), autoFollowSpeed * delta * (isMoving ? 1 : 0.45));
        sphericalTarget.current.theta = wrapAngle(
          sphericalTarget.current.theta + step
        );
      }
    }

    const rotationDamp = dampingFactor(pointer.isOrbiting ? 0.32 : 0.24, delta);
    spherical.current.theta = wrapAngle(
      shortestAngleStep(
        spherical.current.theta,
        sphericalTarget.current.theta,
        rotationDamp
      )
    );
    spherical.current.phi = THREE.MathUtils.lerp(
      spherical.current.phi,
      sphericalTarget.current.phi,
      rotationDamp
    );
    spherical.current.radius = THREE.MathUtils.lerp(
      spherical.current.radius,
      baseRadius.current,
      dampingFactor(0.12, delta)
    );

    const desiredAnchor = tempDesired.current
      .copy(characterPosition)
      .add(targetOffsetVector);
    const anchorLerp = dampingFactor(smoothness, delta);
    anchorTarget.current.lerp(desiredAnchor, anchorLerp);
    smoothedAnchor.current.copy(anchorTarget.current);
    lookTarget.current.lerp(desiredAnchor, dampingFactor(rotationSmoothness, delta));

    const offset = tempOffset.current.setFromSpherical(spherical.current);
    const desiredCameraPosition = tempDesired.current
      .copy(smoothedAnchor.current)
      .add(offset);

    smoothedCameraPosition.current.lerp(desiredCameraPosition, anchorLerp);
    camera.position.set(
      smoothedCameraPosition.current.x,
      smoothedCameraPosition.current.y,
      smoothedCameraPosition.current.z
    );
    camera.lookAt(
      lookTarget.current.x,
      lookTarget.current.y,
      lookTarget.current.z
    );
    camera.updateMatrixWorld();

    tempForward.current
      .copy(lookTarget.current)
      .sub(camera.position)
      .normalize();

    const flatForward = tempRight.current.copy(tempForward.current);
    flatForward.y = 0;

    if (flatForward.lengthSq() > 1e-6) {
      flatForward.normalize();
      cameraBasisRef.current.forward.copy(flatForward);
      cameraBasisRef.current.right
        .crossVectors(flatForward, UP)
        .normalize();
      cameraBasisRef.current.yaw = Math.atan2(flatForward.x, flatForward.z);
    }
  });

  return null;
}
