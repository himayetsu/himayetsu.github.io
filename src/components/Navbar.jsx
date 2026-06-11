import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import './Navbar.css'

const navItems = [
  { id: 'home', label: 'Home' },
  { id: 'about', label: 'About' },
  { id: 'projects', label: 'Projects' },
  { id: 'resume', label: 'Resume' },
  { id: 'contact', label: 'Contact' },
]

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [active, setActive] = useState('home')

  const handleScroll = useCallback(() => {
    setScrolled(window.scrollY > 50)

    const sections = navItems.map(item => {
      const el = document.getElementById(item.id)
      if (!el) return { id: item.id, top: 0 }
      return { id: item.id, top: el.offsetTop - 150 }
    })

    const scrollY = window.scrollY
    for (let i = sections.length - 1; i >= 0; i--) {
      if (scrollY >= sections[i].top) {
        setActive(sections[i].id)
        break
      }
    }
  }, [])

  useEffect(() => {
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [handleScroll])

  const scrollTo = (id) => {
    const el = document.getElementById(id)
    if (el) el.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <motion.nav
      className={`navbar ${scrolled ? 'scrolled' : ''}`}
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
    >
      <button className="nav-logo" onClick={() => scrollTo('home')} data-hover>
        <span className="logo-text">henryli</span>
      </button>

      <div className="nav-right">
        <div className="nav-links">
          {navItems.map(item => (
            <button
              key={item.id}
              className={`nav-link ${active === item.id ? 'active' : ''}`}
              onClick={() => scrollTo(item.id)}
              data-hover
            >
              {item.label}
              {active === item.id && (
                <motion.div
                  className="nav-indicator"
                  layoutId="nav-indicator"
                  transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                />
              )}
            </button>
          ))}
        </div>

        <a className="nav-v3" href="/v3/" data-hover>
          V3 ↗
        </a>
      </div>
    </motion.nav>
  )
}
