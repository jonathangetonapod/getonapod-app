import { Link } from 'react-router-dom';

const Footer = () => {
  return (
    <footer className="border-t border-[#0d1b2a]/8 bg-[#f3f5f7] py-12 md:py-16">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-10">
          <div>
            <div className="font-display text-2xl font-semibold tracking-[-0.05em] text-[#0d1b2a] mb-3">
              GET ON A POD
            </div>
            <p className="text-sm leading-7 text-[#4c5d73]">
              A podcast authority platform for founders, financial professionals, and experts who need trust before they sell.
            </p>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-[#0d1b2a] mb-3">Explore</h4>
            <nav className="flex flex-col gap-2">
              <a href="/#results" className="text-sm text-[#4c5d73] hover:text-[#0d1b2a] transition-colors">Results</a>
              <a href="/#pricing" className="text-sm text-[#4c5d73] hover:text-[#0d1b2a] transition-colors">Pricing</a>
              <Link to="/premium-placements" className="text-sm text-[#4c5d73] hover:text-[#0d1b2a] transition-colors">Premium Placements</Link>
            </nav>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-[#0d1b2a] mb-3">Learn</h4>
            <nav className="flex flex-col gap-2">
              <a href="/#how-it-works" className="text-sm text-[#4c5d73] hover:text-[#0d1b2a] transition-colors">How It Works</a>
              <Link to="/resources" className="text-sm text-[#4c5d73] hover:text-[#0d1b2a] transition-colors">Resources</Link>
              <Link to="/blog" className="text-sm text-[#4c5d73] hover:text-[#0d1b2a] transition-colors">Blog</Link>
            </nav>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-[#0d1b2a] mb-3">Access</h4>
            <nav className="flex flex-col gap-2">
              <Link
                to="/portal/login"
                className="text-sm text-[#4c5d73] hover:text-[#0d1b2a] transition-colors"
              >
                Client Portal Login
              </Link>
              <Link
                to="/what-to-expect"
                className="text-sm text-[#4c5d73] hover:text-[#0d1b2a] transition-colors"
              >
                What to Expect
              </Link>
              <a
                href="https://calendly.com/getonapodjg/30min"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-[#4c5d73] hover:text-[#0d1b2a] transition-colors"
              >
                Get My Podcast Shortlist
              </a>
            </nav>
          </div>
        </div>

        <div className="border-t border-[#0d1b2a]/8 pt-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-[#5d7188]">
            &copy; {new Date().getFullYear()} Get On A Pod. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
