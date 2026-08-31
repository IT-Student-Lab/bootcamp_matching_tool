import type { Metadata } from "next";

import { AdminPanel } from "./admin-panel";
import styles from "./admin.module.css";

export const metadata: Metadata = { title: "Match Control | Live Matchmaker" };

export default function AdminPage() {
  return <main className={styles.page}><AdminPanel /></main>;
}