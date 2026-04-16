"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";

import type {
  GeneratedGeometry,
  GeneratedPart,
  PlacedGeneratedObject,
} from "@/lib/ai-object-schema";
import { toVec3Tuple } from "@/lib/ai-object-schema";

function Geometry({ geometry }: { geometry: GeneratedGeometry }) {
  switch (geometry.type) {
    case "box":
      return (
        <boxGeometry
          args={[geometry.width ?? 1, geometry.height ?? 1, geometry.depth ?? 1]}
        />
      );
    case "sphere":
      return (
        <sphereGeometry
          args={[
            geometry.radius ?? 0.8,
            geometry.widthSegments ?? 10,
            geometry.heightSegments ?? 8,
          ]}
        />
      );
    case "cylinder":
      return (
        <cylinderGeometry
          args={[
            geometry.radiusTop ?? 0.3,
            geometry.radiusBottom ?? 0.3,
            geometry.height ?? 1.2,
            geometry.radialSegments ?? 8,
          ]}
        />
      );
    case "cone":
      return (
        <coneGeometry
          args={[
            geometry.radius ?? 0.35,
            geometry.height ?? 1.2,
            geometry.radialSegments ?? 8,
          ]}
        />
      );
    case "capsule":
      return (
        <capsuleGeometry
          args={[
            geometry.radius ?? 0.25,
            geometry.length ?? 1,
            geometry.capSegments ?? 4,
            geometry.radialSegments ?? 8,
          ]}
        />
      );
    case "torus":
      return (
        <torusGeometry
          args={[
            geometry.radius ?? 0.7,
            geometry.tube ?? 0.15,
            geometry.radialSegments ?? 8,
            geometry.tubularSegments ?? 12,
          ]}
        />
      );
  }
}

function PartMesh({ part }: { part: GeneratedPart }) {
  return (
    <mesh
      castShadow
      receiveShadow
      position={toVec3Tuple(part.position)}
      rotation={toVec3Tuple(part.rotation)}
      scale={toVec3Tuple(part.scale)}
    >
      <Geometry geometry={part.geometry} />
      <meshStandardMaterial
        color={part.material.color}
        roughness={part.material.roughness}
        metalness={part.material.metalness}
        emissive={part.material.emissive}
        emissiveIntensity={part.material.emissiveIntensity}
        opacity={part.material.opacity}
        transparent={part.material.opacity < 0.999}
        flatShading={part.material.flatShading}
      />
    </mesh>
  );
}

export function GeneratedObject({
  object,
  isSelected = false,
  onSelect,
}: {
  object: PlacedGeneratedObject;
  isSelected?: boolean;
  onSelect?: (objectId: string) => void;
}) {
  const duplicatePartNames = useMemo(() => {
    const counts = new Map<string, number>();

    for (const part of object.definition.parts) {
      counts.set(part.name, (counts.get(part.name) ?? 0) + 1);
    }

    return Array.from(counts.entries())
      .filter(([, count]) => count > 1)
      .map(([name]) => name);
  }, [object.definition.parts]);

  useEffect(() => {
    if (duplicatePartNames.length === 0) {
      return;
    }

    console.warn("GeneratedObject has duplicate part names.", {
      objectId: object.id,
      objectLabel: object.label,
      duplicatePartNames,
    });
  }, [duplicatePartNames, object.id, object.label]);

  const selectionRadius = useMemo(() => {
    let radius = 0.85;

    for (const part of object.definition.parts) {
      const dx = maxComponent(
        part.position.x,
        part.position.x + part.scale.x,
        part.position.x - part.scale.x,
      );
      const dz = maxComponent(
        part.position.z,
        part.position.z + part.scale.z,
        part.position.z - part.scale.z,
      );
      radius = Math.max(radius, Math.hypot(dx, dz));
    }

    return Math.min(6, radius + 0.35);
  }, [object.definition.parts]);

  return (
    <group
      position={object.transform.position}
      rotation={object.transform.rotation}
      scale={object.transform.scale}
      onPointerDown={(event) => {
        event.stopPropagation();
        onSelect?.(object.id);
      }}
    >
      {isSelected ? (
        <mesh
          position={[0, 0.04, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          renderOrder={2}
        >
          <ringGeometry args={[selectionRadius, selectionRadius + 0.12, 40]} />
          <meshBasicMaterial
            color="#86efac"
            transparent
            opacity={0.95}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      ) : null}
      {object.definition.parts.map((part, index) => (
        <PartMesh key={`${object.id}-${part.name}-${index}`} part={part} />
      ))}
    </group>
  );
}

function maxComponent(...values: number[]) {
  return values.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
}
