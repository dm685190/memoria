import styles from "./page.module.css";

export default function Home() {
  return (
    <main className={styles.pageShell}>
      <section className={styles.card}>
        <p className={styles.eyebrow}>Robin Cloud</p>
        <h1>Robin is alive.</h1>
        <p className={styles.lede}>
          A portable memory and orchestration layer for Dylan, designed to keep
          Robin intact across OpenClaw, Hermes, and whatever vessel comes next.
        </p>
        <div className={styles.statusGrid}>
          <div>
            <span>Control plane</span>
            <strong>Vercel</strong>
          </div>
          <div>
            <span>Private execution</span>
            <strong>Local node</strong>
          </div>
          <div>
            <span>Memory intake</span>
            <strong>RobinVault</strong>
          </div>
        </div>
      </section>
    </main>
  );
}
