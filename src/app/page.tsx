import {
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs";
import styles from "./page.module.css";

export default function Home() {
  return (
    <main className={styles.pageShell}>
      <section className={styles.card}>
        <div className={styles.topBar}>
          <p className={styles.eyebrow}>Robin Cloud</p>
          <div className={styles.authControls}>
            <Show when="signed-out">
              <SignInButton mode="modal">
                <button className={styles.secondaryButton}>Sign in</button>
              </SignInButton>
              <SignUpButton mode="modal">
                <button className={styles.primaryButton}>Sign up</button>
              </SignUpButton>
            </Show>
            <Show when="signed-in">
              <UserButton />
            </Show>
          </div>
        </div>

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
        <Show when="signed-in">
          <p className={styles.signedInNote}>
            Auth gate is open. The first ghost has a name.
          </p>
        </Show>
      </section>
    </main>
  );
}
