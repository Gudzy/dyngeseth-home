import styles from './Nav.module.css'

export default function Nav() {
  return (
    <nav className={styles.nav}>
      <a href="#top" className={styles.logo}>
        <span className={styles.logoText}>GD</span>
      </a>
      <div className={styles.links}>
        <a href="#transcribe">Lytt</a>
        <a href="#contact">Contact</a>
      </div>
    </nav>
  )
}
