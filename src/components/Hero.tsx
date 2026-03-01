import styles from './Hero.module.css'

export default function Hero() {
  return (
    <section id="top" className={styles.hero}>
      <div className={styles.inner}>
        <div className={styles.topLine}>
          <span className={styles.line} />
          <p className={styles.eyebrow}>Developer · Oslo, Norway</p>
        </div>
        <h1 className={styles.name}>Gustav<br /><em>Dyngeseth</em></h1>
        <p className={styles.bio}>
          I build thoughtful digital products — clean interfaces, solid infrastructure,
          and tools that do exactly what they're supposed to.
        </p>
        <div className={styles.tags}>
          <span>React</span>
          <span>TypeScript</span>
          <span>Azure</span>
        </div>
        <div className={styles.scrollHint}>↓</div>
      </div>
      <div className={styles.deco} aria-hidden="true">
        <span>dyngeseth.no</span>
      </div>
    </section>
  )
}
