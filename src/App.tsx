import Nav from './components/Nav'
import Hero from './components/Hero'
import Transcriber from './components/Transcriber'
import Contact from './components/Contact'
import Footer from './components/Footer'

function App() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Transcriber />
        <Contact />
      </main>
      <Footer />
    </>
  )
}

export default App
