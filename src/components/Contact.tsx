import styles from './Contact.module.css'

export default function Contact() {
  return (
    <section id="contact" className={styles.section}>
      <div className={styles.inner}>
        <div className={styles.topLine}>
          <span className={styles.line} />
          <p className={styles.eyebrow}>Say hello</p>
        </div>
        <h2 className={styles.title}>Get in touch</h2>
        <p className={styles.text}>
          Have a project in mind, or just want to connect?
        </p>
        <a className={styles.emailLink} href="mailto:hello@dyngeseth.no">
          hello@dyngeseth.no ↗
        </a>
        <div className={styles.socials}>
          <a href="https://github.com/gustavdyngeseth" target="_blank" rel="noopener noreferrer">GitHub</a>
          <a href="https://linkedin.com/in/gustavdyngeseth" target="_blank" rel="noopener noreferrer">LinkedIn</a>
        </div>
      </div>
    </section>
  )
}
