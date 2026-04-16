"use client";

import { Text, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";

import { useOther } from "@/lib/liveblocks.config";

const MODEL_URL = "/characters/char_rbot.glb";
const TARGET_HEIGHT = 1.9;

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
  const targetPositionRef = useRef(new THREE.Vector3());
  const targetQuaternionRef = useRef(new THREE.Quaternion());
  const targetEulerRef = useRef(new THREE.Euler(0, 0, 0, "YXZ"));
  const mixerRef = useRef(null);
  const actionsRef = useRef({});
  const activeClipRef = useRef(null);

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

    targetPositionRef.current.fromArray(presence.position);
    targetQuaternionRef.current.fromArray(presence.rotation);

    const nextClip = MOVEMENT_CLIPS[presence.animation] ?? MOVEMENT_CLIPS.idle;
    playClip(nextClip);
  }, [playClip, presence]);

  useFrame((_, delta) => {
    if (!presence) {
      return;
    }

    const positionLerp = 1 - Math.exp(-10 * delta);
    const rotationLerp = 1 - Math.exp(-12 * delta);

    if (groupRef.current) {
      groupRef.current.position.lerp(targetPositionRef.current, positionLerp);
    }

    if (visualRef.current) {
      targetEulerRef.current.setFromQuaternion(targetQuaternionRef.current);
      visualRef.current.rotation.y = THREE.MathUtils.lerp(
        visualRef.current.rotation.y,
        targetEulerRef.current.y,
        rotationLerp,
      );
    }

    mixerRef.current?.update(delta);
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
