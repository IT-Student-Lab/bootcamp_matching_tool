"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

import styles from "./screen.module.css";

export class ScreenBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() { return { failed: true }; }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("screen_render_failed", error.message, info.componentStack);
  }

  render() {
    if (this.state.failed) return <main className={styles.fallbackFrame}><span className={styles.connectionOffline} /></main>;
    return this.props.children;
  }
}