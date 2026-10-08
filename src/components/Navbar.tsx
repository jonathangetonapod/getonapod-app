import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { CALL_URL } from '@/lib/landingContent';
import '@/styles/landing.css';

// These anchors are sections of the homepage. Every href here must match an
// id that page actually renders, or the reader lands on nothing.
const navLinks = [
  { href: '/#how', label: 'How it works' },
  { href: '/#shows', label: 'The shows' },
  { href: '/#pricing', label: 'Pricing' },
  { href: '/#faq', label: 'FAQ' },
  { href: '/platform', label: 'For agencies' },
  // The resource library is still being written; it comes back here when it
  // has something to read. The footer keeps the link meanwhile.
  { href: '/login', label: 'Sign in' },
];

/** The wordmark as the homepage sets it: two italics and a gold full stop. */
export const Brand = () => (
  <>Get<i>on</i>a<i>Pod</i><b>.</b></>
);

/**
 * The homepage's bar, for every inner page. It sits inside a .dfy-page so it
 * takes the page's faces and palette; below the desktop breakpoint the links
 * fold behind a menu button rather than wrapping into a second row.
 */
const Navbar = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const renderLink = (link: (typeof navLinks)[number], onClick?: () => void) =>
    link.href.includes('#') ? (
      <a key={link.href} href={link.href} className="dfy-nav-link" onClick={onClick}>
        {link.label}
      </a>
    ) : (
      <Link key={link.href} to={link.href} className="dfy-nav-link" onClick={onClick}>
        {link.label}
      </Link>
    );

  return (
    <nav className={`dfy-site-nav${isScrolled ? ' dfy-site-nav-scrolled' : ''}`} aria-label="Site">
      {/* The terms strip. On a phone it would push the bar past 64px, and the
          homepage states the same facts under its hero. */}
      <div className="dfy-site-strip">
        <div className="dfy-site-strip-in">
          <span>Done-for-you podcast guesting · $1,000 a month</span>
          <span>You approve every show · about 15 minutes a week</span>
        </div>
      </div>

      <div className="dfy-site-bar">
        <Link to="/" className="dfy-brand" aria-label="Get On A Pod, home">
          <Brand />
        </Link>

        <div className="dfy-site-links">{navLinks.map((link) => renderLink(link))}</div>

        <a
          className="dfy-btn dfy-btn-primary dfy-site-cta"
          href={CALL_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          Book a 30-minute call
        </a>

        <button
          type="button"
          className="dfy-site-toggle"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          aria-label="Toggle navigation"
          aria-expanded={isMobileMenuOpen}
          aria-controls="site-nav-menu"
        >
          {isMobileMenuOpen ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
        </button>
      </div>

      {isMobileMenuOpen && (
        <div id="site-nav-menu" className="dfy-site-menu">
          {navLinks.map((link) => renderLink(link, () => setIsMobileMenuOpen(false)))}
          <a
            className="dfy-btn dfy-btn-primary"
            href={CALL_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            Book a 30-minute call
          </a>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
