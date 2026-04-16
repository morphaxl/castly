"use client";

import { useCallback, useEffect, useRef } from "react";

type CharacterControlsState = {
  forward: boolean;
  backward: boolean;
  strafeLeft: boolean;
  strafeRight: boolean;
  sprint: boolean;
  jump: boolean;
};

export type CharacterControls = CharacterControlsState;

export function useCharacterControls(enabled = true) {
  const keys = useRef<CharacterControlsState>({
    forward: false,
    backward: false,
    strafeLeft: false,
    strafeRight: false,
    sprint: false,
    jump: false,
  });
  const jumpPressed = useRef(false);

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    const activeElement = document.activeElement;
    if (
      activeElement instanceof HTMLInputElement ||
      activeElement instanceof HTMLTextAreaElement ||
      activeElement?.getAttribute("contenteditable") === "true"
    ) {
      return;
    }

    switch (event.code) {
      case "KeyW":
      case "ArrowUp":
        keys.current.forward = true;
        break;
      case "KeyS":
      case "ArrowDown":
        keys.current.backward = true;
        break;
      case "KeyA":
      case "ArrowLeft":
        keys.current.strafeLeft = true;
        break;
      case "KeyD":
      case "ArrowRight":
        keys.current.strafeRight = true;
        break;
      case "ShiftLeft":
      case "ShiftRight":
        keys.current.sprint = true;
        break;
      case "Space":
        if (!jumpPressed.current) {
          keys.current.jump = true;
          jumpPressed.current = true;
        }
        event.preventDefault();
        break;
      default:
        break;
    }
  }, []);

  const handleKeyUp = useCallback((event: KeyboardEvent) => {
    switch (event.code) {
      case "KeyW":
      case "ArrowUp":
        keys.current.forward = false;
        break;
      case "KeyS":
      case "ArrowDown":
        keys.current.backward = false;
        break;
      case "KeyA":
      case "ArrowLeft":
        keys.current.strafeLeft = false;
        break;
      case "KeyD":
      case "ArrowRight":
        keys.current.strafeRight = false;
        break;
      case "ShiftLeft":
      case "ShiftRight":
        keys.current.sprint = false;
        break;
      case "Space":
        keys.current.jump = false;
        jumpPressed.current = false;
        break;
      default:
        break;
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [enabled, handleKeyDown, handleKeyUp]);

  return {
    get forward() {
      return keys.current.forward;
    },
    get backward() {
      return keys.current.backward;
    },
    get strafeLeft() {
      return keys.current.strafeLeft;
    },
    get strafeRight() {
      return keys.current.strafeRight;
    },
    get sprint() {
      return keys.current.sprint;
    },
    get jump() {
      return keys.current.jump;
    },
  };
}
