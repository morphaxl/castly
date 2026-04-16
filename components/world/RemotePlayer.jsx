"use client";

import { Text, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";

import { useOther } from "@/lib/liveblocks.config";

const MODEL_URL = "/characters/char_rbot.glb";
const TARGET_HEIGHT = 1.9;
const INTERPOLATION_DELAY_MS = 100;
const MAX_SNAPSHOT_AGE_MS = 500;
const MAX_EXTRAPOLATION_SECONDS = 0.12;
const POSITION_SNAP_EPSILON_SQ = 0.0001;

const lerpAngle = (start, end, t) => {
  const delta = ((end - start + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  return start + delta * t;
};

const MOVEMENT_CLIPS = {
  idle: "Idle_Loop",
  walk: "Walk_Loop",
  run: "Sprint_Loop",
  jump: "Jump_Loop",
};

export function RemotePlayer({ connectionId }) {
  const presence = useOther(connectionId, (user) => user.presence);
  const groupRef = useRef(null);
  const visualRef = useRef(null);
  const mixerRef = useRef(null);
  const actionsRef = useRef({});
  const activeClipRef = useRef(null);
  const snapshotsRef = useRef([]);
  const targetPositionRef = useRef(new THREE.Vector3());
  const targetVelocityRef = useRef(new THREE.Vector3());

  const gltf = useGLTF(MODEL_URL);
  const characterScene = useMemo(() => clone(gltf.scene), [gltf.scene]);

  const playClip = useCallback((clipName) => {
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
    nextAction.setLoop(THREE.LoopRepeat, Infinity);
    nextAction.fadeIn(0.2);
    nextAction.play();

    if (previousAction) {
      previousAction.fadeOut(0.2);
    }

    activeClipRef.current = clipName;
  }, []);

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
    for (const clip of gltf.animations) {
      const action = mixer.clipAction(clip);
      action.enabled = true;
      actions[clip.name] = action;
    }

    actionsRef.current = actions;
    playClip(MOVEMENT_CLIPS.idle);

    return () => {
      mixer.stopAllAction();
      actionsRef.current = {};
      activeClipRef.current = null;
      mixerRef.current = null;
    };
  }, [characterScene, gltf.animations, playClip]);

  useEffect(() => {
    if (!presence) {
      return;
    }

    const snapshot = {
      position: new THREE.Vector3().fromArray(presence.position),
      rotationY: new THREE.Euler()
        .setFromQuaternion(new THREE.Quaternion().fromArray(presence.rotation))
        .y,
      velocity: new THREE.Vector3().fromArray(presence.velocity),
      receivedAt: performance.now(),
    };
    const snapshots = snapshotsRef.current;

    snapshots.push(snapshot);
    while (snapshots.length > 8) {
      snapshots.shift();
    }

    if (groupRef.current && !groupRef.current.userData.initialized) {
      groupRef.current.position.copy(snapshot.position);
      groupRef.current.userData.initialized = true;
    }

    if (visualRef.current && !visualRef.current.userData.initialized) {
      visualRef.current.rotation.y = snapshot.rotationY;
      visualRef.current.userData.initialized = true;
    }

    const nextClip = MOVEMENT_CLIPS[presence.animation] ?? MOVEMENT_CLIPS.idle;
    playClip(nextClip);
  }, [playClip, presence]);

  useFrame((_, delta) => {
    if (!presence) {
      return;
    }

    const snapshots = snapshotsRef.current;
    if (!snapshots.length) {
      mixerRef.current?.update(delta);
      return;
    }

    const now = performance.now();
    const renderTimestamp = now - INTERPOLATION_DELAY_MS;

    while (snapshots.length >= 2 && snapshots[1].receivedAt <= renderTimestamp) {
      snapshots.shift();
    }

    let targetRotationY = snapshots[snapshots.length - 1].rotationY;

    if (
      snapshots.length >= 2 &&
      snapshots[0].receivedAt <= renderTimestamp &&
      renderTimestamp <= snapshots[1].receivedAt
    ) {
      const from = snapshots[0];
      const to = snapshots[1];
      const interval = Math.max(1, to.receivedAt - from.receivedAt);
      const alpha = THREE.MathUtils.clamp(
        (renderTimestamp - from.receivedAt) / interval,
        0,
        1,
      );

      targetPositionRef.current.copy(from.position).lerp(to.position, alpha);
      targetVelocityRef.current.copy(to.velocity);
      targetRotationY = lerpAngle(from.rotationY, to.rotationY, alpha);
    } else {
      const latest = snapshots[snapshots.length - 1];
      targetPositionRef.current.copy(latest.position);
      targetVelocityRef.current.copy(latest.velocity);
      targetRotationY = latest.rotationY;

      const extrapolationSeconds = Math.min(
        Math.max(0, renderTimestamp - latest.receivedAt) / 1000,
        MAX_EXTRAPOLATION_SECONDS,
      );

      if (extrapolationSeconds > 0) {
        targetPositionRef.current.addScaledVector(
          targetVelocityRef.current,
          extrapolationSeconds,
        );
      }
    }

    if (groupRef.current) {
      const positionLerp = THREE.MathUtils.clamp(delta / 0.12, 0, 1);
      groupRef.current.position.lerp(targetPositionRef.current, positionLerp);

      if (
        groupRef.current.position.distanceToSquared(targetPositionRef.current) <
        POSITION_SNAP_EPSILON_SQ
      ) {
        groupRef.current.position.copy(targetPositionRef.current);
      }
    }

    if (visualRef.current) {
      const rotationLerp = THREE.MathUtils.clamp(delta / 0.14, 0, 1);
      visualRef.current.rotation.y = lerpAngle(
        visualRef.current.rotation.y,
        targetRotationY,
        rotationLerp,
      );
    }

    mixerRef.current?.update(delta);

    while (snapshots.length && now - snapshots[0].receivedAt > MAX_SNAPSHOT_AGE_MS) {
      snapshots.shift();
    }
  });

  if (!presence) {
    return null;
  }

  return (
    <group ref={groupRef} position={presence.position}>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.03, 0]}
        receiveShadow
      >
        <ringGeometry args={[0.42, 0.58, 32]} />
        <meshBasicMaterial
          color={presence.color}
          transparent
          opacity={0.92}
          side={THREE.DoubleSide}
        />
      </mesh>

      <group ref={visualRef}>
        <primitive object={characterScene} />
      </group>

      <Text
        position={[0, 2.75, 0]}
        fontSize={0.22}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
        outlineColor="#050507"
        outlineWidth={0.02}
      >
        {presence.name}
      </Text>
    </group>
  );
}

useGLTF.preload(MODEL_URL);
