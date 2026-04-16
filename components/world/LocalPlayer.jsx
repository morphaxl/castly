"use client";

import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";

import { CharacterCamera } from "@/components/world/CharacterCamera";
import { useCharacterControls } from "@/hooks/useCharacterControls";
import { useUpdateMyPresence } from "@/lib/liveblocks.config";

const MODEL_URL = "/characters/char_rbot.glb";
const TARGET_HEIGHT = 1.9;

const dampFactor = (rate, delta) => 1 - Math.exp(-rate * delta);

const MOVEMENT_CLIPS = {
  idle: "Idle_Loop",
  walk: "Walk_Loop",
  run: "Sprint_Loop",
  jumpStart: "Jump_Start",
  jumpLoop: "Jump_Loop",
  jumpLand: "Jump_Land",
};

const WALK_SPEED = 3.8;
const RUN_SPEED = 6.1;
const JUMP_FORCE = 5.8;
const GRAVITY = 18;
const GROUND_Y = 0;
const PRESENCE_SEND_INTERVAL = 1 / 30;

export function LocalPlayer({ identity, initialPosition, onTransformChange }) {
  const controls = useCharacterControls(true);
  const updateMyPresence = useUpdateMyPresence();
  const playerRef = useRef(null);
  const visualRef = useRef(null);
  const positionRef = useRef(new THREE.Vector3(...initialPosition));
  const rotationRef = useRef(0);
  const velocityRef = useRef(new THREE.Vector3());
  const moveDirectionRef = useRef(new THREE.Vector3());
  const zeroVectorRef = useRef(new THREE.Vector3(0, 0, 0));
  const mixerRef = useRef(null);
  const actionsRef = useRef({});
  const clipDurationsRef = useRef({});
  const activeClipRef = useRef(null);
  const lastPresenceRef = useRef(null);
  const sendAccumulatorRef = useRef(0);
  const jumpPhaseRef = useRef("grounded");
  const jumpTimerRef = useRef(0);
  const verticalVelocityRef = useRef(0);
  const jumpLatchRef = useRef(false);
  const presenceQuaternionRef = useRef(new THREE.Quaternion());
  const presenceEulerRef = useRef(new THREE.Euler(0, 0, 0, "YXZ"));

  const cameraBasisRef = useRef({
    controls: {
      forward: false,
      backward: false,
      strafeLeft: false,
      strafeRight: false,
      sprint: false,
      jump: false,
    },
    forward: new THREE.Vector3(0, 0, -1),
    right: new THREE.Vector3(1, 0, 0),
    yaw: 0,
  });

  const gltf = useGLTF(MODEL_URL);
  const characterScene = useMemo(() => clone(gltf.scene), [gltf.scene]);

  const playClip = useCallback((clipName, options = {}) => {
    const { fadeDuration = 0.2, loop = true } = options;
    const nextAction = actionsRef.current[clipName];
    if (!nextAction || activeClipRef.current === clipName) {
      return;
    }

    const previousAction = activeClipRef.current
      ? actionsRef.current[activeClipRef.current]
      : null;

    nextAction.reset();
    nextAction.enabled = true;
    nextAction.setEffectiveTimeScale(1);
    nextAction.setEffectiveWeight(1);
    nextAction.clampWhenFinished = !loop;
    nextAction.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    nextAction.fadeIn(fadeDuration);
    nextAction.play();

    if (previousAction) {
      previousAction.fadeOut(fadeDuration);
    }

    activeClipRef.current = clipName;
  }, []);

  useEffect(() => {
    cameraBasisRef.current.controls = controls;
  }, [controls]);

  useEffect(() => {
    characterScene.traverse((child) => {
      if (child.isMesh || child.isSkinnedMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        child.frustumCulled = false;
      }
    });

    const box = new THREE.Box3().setFromObject(characterScene);
    const size = box.getSize(new THREE.Vector3());
    const scale = size.y > 0 ? TARGET_HEIGHT / size.y : 1;

    characterScene.scale.setScalar(scale);
    characterScene.position.set(0, -box.min.y * scale, 0);

    const mixer = new THREE.AnimationMixer(characterScene);
    mixerRef.current = mixer;

    const actions = {};
    const durations = {};
    for (const clip of gltf.animations) {
      const action = mixer.clipAction(clip);
      action.enabled = true;
      action.clampWhenFinished = false;
      action.loop = THREE.LoopRepeat;
      actions[clip.name] = action;
      durations[clip.name] = clip.duration;
    }

    actionsRef.current = actions;
    clipDurationsRef.current = durations;
    playClip(MOVEMENT_CLIPS.idle, { fadeDuration: 0 });

    return () => {
      mixer.stopAllAction();
      actionsRef.current = {};
      clipDurationsRef.current = {};
      activeClipRef.current = null;
      mixerRef.current = null;
    };
  }, [characterScene, gltf.animations, playClip]);



  useFrame((_, delta) => {
    sendAccumulatorRef.current += delta;

    if (!controls.jump) {
      jumpLatchRef.current = false;
    }

    const moveDirection = moveDirectionRef.current.set(0, 0, 0);
    const forward = cameraBasisRef.current.forward;
    const right = cameraBasisRef.current.right;

    if (controls.forward) moveDirection.add(forward);
    if (controls.backward) moveDirection.sub(forward);
    if (controls.strafeRight) moveDirection.add(right);
    if (controls.strafeLeft) moveDirection.sub(right);

    const hasInput = moveDirection.lengthSq() > 0;

    if (hasInput) {
      moveDirection.normalize();
      const speed = controls.sprint ? RUN_SPEED : WALK_SPEED;
      velocityRef.current.lerp(
        moveDirection.multiplyScalar(speed),
        dampFactor(12, delta)
      );
      positionRef.current.addScaledVector(velocityRef.current, delta);

      const targetRotation = Math.atan2(
        velocityRef.current.x,
        velocityRef.current.z
      );
      rotationRef.current = THREE.MathUtils.lerp(
        rotationRef.current,
        targetRotation,
        dampFactor(10, delta)
      );
    } else {
      velocityRef.current.lerp(
        zeroVectorRef.current,
        dampFactor(14, delta)
      );
    }

    if (
      controls.jump &&
      !jumpLatchRef.current &&
      jumpPhaseRef.current === "grounded"
    ) {
      jumpLatchRef.current = true;
      jumpPhaseRef.current = "start";
      jumpTimerRef.current =
        clipDurationsRef.current[MOVEMENT_CLIPS.jumpStart] ?? 0.4;
      verticalVelocityRef.current = JUMP_FORCE;
      playClip(MOVEMENT_CLIPS.jumpStart, { loop: false });
    }

    if (jumpPhaseRef.current !== "grounded") {
      positionRef.current.y += verticalVelocityRef.current * delta;
      verticalVelocityRef.current -= GRAVITY * delta;
      jumpTimerRef.current = Math.max(0, jumpTimerRef.current - delta);

      if (
        jumpPhaseRef.current === "start" &&
        jumpTimerRef.current <= 0 &&
        positionRef.current.y > GROUND_Y
      ) {
        jumpPhaseRef.current = "loop";
        playClip(MOVEMENT_CLIPS.jumpLoop);
      }

      if (positionRef.current.y <= GROUND_Y && verticalVelocityRef.current <= 0) {
        positionRef.current.y = GROUND_Y;
        verticalVelocityRef.current = 0;

        if (jumpPhaseRef.current !== "land") {
          jumpPhaseRef.current = "land";
          jumpTimerRef.current =
            clipDurationsRef.current[MOVEMENT_CLIPS.jumpLand] ?? 0.35;
          playClip(MOVEMENT_CLIPS.jumpLand, { loop: false });
        }
      }

      if (jumpPhaseRef.current === "land" && jumpTimerRef.current <= 0) {
        jumpPhaseRef.current = "grounded";
      }
    } else {
      positionRef.current.y = GROUND_Y;
    }

    if (playerRef.current) {
      playerRef.current.position.copy(positionRef.current);
    }

    if (visualRef.current) {
      visualRef.current.rotation.y = rotationRef.current;
    }

    onTransformChange?.(
      [
        positionRef.current.x,
        positionRef.current.y,
        positionRef.current.z,
      ],
      rotationRef.current
    );

    const horizontalSpeed = Math.hypot(
      velocityRef.current.x,
      velocityRef.current.z
    );

    const nextAnimation =
      jumpPhaseRef.current !== "grounded"
        ? "jump"
        : horizontalSpeed < 0.2
          ? "idle"
          : controls.sprint
            ? "run"
            : "walk";

    if (jumpPhaseRef.current === "grounded") {
      if (horizontalSpeed < 0.2) {
        playClip(MOVEMENT_CLIPS.idle);
      } else if (controls.sprint) {
        playClip(MOVEMENT_CLIPS.run);
      } else {
        playClip(MOVEMENT_CLIPS.walk);
      }
    }

    presenceEulerRef.current.set(0, rotationRef.current, 0);
    presenceQuaternionRef.current.setFromEuler(presenceEulerRef.current);

    const nextPresence = {
      name: identity.name,
      color: identity.color,
      position: [
        positionRef.current.x,
        positionRef.current.y,
        positionRef.current.z,
      ],
      rotation: [
        presenceQuaternionRef.current.x,
        presenceQuaternionRef.current.y,
        presenceQuaternionRef.current.z,
        presenceQuaternionRef.current.w,
      ],
      velocity: [
        velocityRef.current.x,
        jumpPhaseRef.current !== "grounded" ? verticalVelocityRef.current : 0,
        velocityRef.current.z,
      ],
      animation: nextAnimation,
    };

    const lastPresence = lastPresenceRef.current;
    const hasMeaningfulChange =
      !lastPresence ||
      Math.abs(lastPresence.position[0] - nextPresence.position[0]) > 0.01 ||
      Math.abs(lastPresence.position[1] - nextPresence.position[1]) > 0.01 ||
      Math.abs(lastPresence.position[2] - nextPresence.position[2]) > 0.01 ||
      Math.abs(lastPresence.rotation[1] - nextPresence.rotation[1]) > 0.01 ||
      Math.abs(lastPresence.velocity[0] - nextPresence.velocity[0]) > 0.05 ||
      Math.abs(lastPresence.velocity[1] - nextPresence.velocity[1]) > 0.05 ||
      Math.abs(lastPresence.velocity[2] - nextPresence.velocity[2]) > 0.05 ||
      lastPresence.animation !== nextPresence.animation ||
      lastPresence.name !== nextPresence.name ||
      lastPresence.color !== nextPresence.color;

    const shouldSendPresence =
      !lastPresence ||
      (hasMeaningfulChange &&
        sendAccumulatorRef.current >= PRESENCE_SEND_INTERVAL);

    if (shouldSendPresence) {
      updateMyPresence(nextPresence);
      lastPresenceRef.current = nextPresence;
      sendAccumulatorRef.current = 0;
    }

    mixerRef.current?.update(delta);
  });

  return (
    <>
      <CharacterCamera
        characterPositionRef={positionRef}
        characterRotationRef={rotationRef}
        cameraBasisRef={cameraBasisRef}
      />

      <group ref={playerRef} position={[0, 0, 0]}>
        <group ref={visualRef}>
          <primitive object={characterScene} />
        </group>
      </group>
    </>
  );
}

useGLTF.preload(MODEL_URL);
