"use client";

import { Component, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  fallback?: ReactNode;
  silent?: boolean;
};

type State = {
  hasError: boolean;
};

export class SceneErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("SceneErrorBoundary caught an error", error, info);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    if (this.props.silent) {
      return null;
    }

    if (this.props.fallback) {
      return this.props.fallback;
    }

    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-[#0a0a1a]">
        <p className="text-sm text-white/60">
          Something went wrong rendering the 3D world.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-full border border-white/10 bg-white/[0.06] px-5 py-2 text-sm text-white/80 transition-colors hover:bg-white/[0.12]"
        >
          Reload
        </button>
      </div>
    );
  }
}
