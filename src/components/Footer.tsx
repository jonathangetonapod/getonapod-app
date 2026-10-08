import { Link } from 'react-router-dom';
import { Brand } from '@/components/Navbar';
import { CALL_URL } from '@/lib/landingContent';

/**
 * The homepage's footer, for every inner page: the wordmark and a line, then
 * the site's links in columns. The classes come from src/styles/landing.css
 * and expect to sit inside a .dfy-page.
 */
const Footer = () => {
  return (
    <footer className="dfy-footer">
      <div className="dfy-footer-grid">
        <div>
          <span className="dfy-brand"><Brand /></span>
          <p className="dfy-footer-tagline">
            Get On A Pod books founders, executives, authors and coaches on the podcasts their customers already listen to. $1,000 a month, 3-month minimum, then month to month.
          </p>
        </div>

        <div className="dfy-footer-col">
          <span className="dfy-footer-head">Navigate</span>
          <a href="/#how">How it works</a>
          <a href="/#pricing">Pricing</a>
          <a href="/#faq">FAQ</a>
          <Link to="/what-to-expect">What to expect</Link>
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
        </div>

        <div className="dfy-footer-col">
          <span className="dfy-footer-head">Access</span>
          <a href="/#shows">The shows</a>
          <Link to="/platform">For agencies</Link>
          <Link to="/resources">Resources</Link>
          <Link to="/blog">Blog</Link>
          <Link to="/login">Agency sign-in</Link>
          <Link to="/portal/login">Client portal sign-in</Link>
        </div>

        <div className="dfy-footer-col">
          <span className="dfy-footer-head">Talk to us</span>
          <a href={CALL_URL} target="_blank" rel="noopener noreferrer">
            Book a 30-minute call
          </a>
        </div>
      </div>

      <div className="dfy-footer-foot">
        <span>&copy; {new Date().getFullYear()} Get On A Pod. All rights reserved.</span>
        <span className="dfy-copy-italic">Booked by hand, not by blast.</span>
      </div>
    </footer>
  );
};

export default Footer;
