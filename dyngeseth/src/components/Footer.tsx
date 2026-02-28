import styles from './Footer.module.css'

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <p>© {new Date().getFullYear()} Gustav Dyngeseth</p>
      <p className={styles.built}>Built with React + Azure</p>
    </footer>
  )
}
