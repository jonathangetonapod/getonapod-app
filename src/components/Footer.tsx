import { Link } from 'react-router-dom';

const Footer = () => {
  return (
    <footer className="border-t border-[#0d1b2a]/8 bg-[#f3f5f7] py-12 md:py-16">
      <div className="container mx-auto px-4">
        <div className="grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
          <div>
            <div className="font-display text-2xl font-semibold tracking-[-0.05em] text-[#0d1b2a]">
              GET ON A POD
            </div>
            <p className="mt-3 max-w-xl text-sm leading-7 text-[#4c5d73]">
              Get On A Pod books founders, executives, authors and coaches on the podcasts their customers already listen to. $500 a month, 3-month minimum, then month to month.
            </p>
            <a
              href="https://cal.com/jonathan-garces-x5v8tl/30min"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 inline-flex items-center rounded-full border border-[#0d1b2a]/10 bg-[#f3f7fc] px-4 py-2 text-sm font-medium text-[#0d1b2a] transition hover:-translate-y-0.5 hover:bg-[#ffffff]"
            >
              Book a 30-minute call
            </a>
          </div>

          <div className="grid gap-8 sm:grid-cols-2">
            <div>
              <h4 className="text-sm font-semibold text-[#0d1b2a]">Navigate</h4>
              <nav className="mt-3 flex flex-col sm:gap-2">
                <a href="/#how" className="py-3 text-sm text-[#4c5d73] transition-colors hover:text-[#0d1b2a] sm:py-0">How it works</a>
                <a href="/#pricing" className="py-3 text-sm text-[#4c5d73] transition-colors hover:text-[#0d1b2a] sm:py-0">Pricing</a>
                <a href="/#faq" className="py-3 text-sm text-[#4c5d73] transition-colors hover:text-[#0d1b2a] sm:py-0">FAQ</a>
                <Link to="/what-to-expect" className="py-3 text-sm text-[#4c5d73] transition-colors hover:text-[#0d1b2a] sm:py-0">What to expect</Link>
                <Link to="/privacy" className="py-3 text-sm text-[#4c5d73] transition-colors hover:text-[#0d1b2a] sm:py-0">Privacy</Link>
                <Link to="/terms" className="py-3 text-sm text-[#4c5d73] transition-colors hover:text-[#0d1b2a] sm:py-0">Terms</Link>
              </nav>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-[#0d1b2a]">Access</h4>
              <nav className="mt-3 flex flex-col sm:gap-2">
                <a href="/#shows" className="py-3 text-sm text-[#4c5d73] transition-colors hover:text-[#0d1b2a] sm:py-0">The shows</a>
                <Link to="/platform" className="py-3 text-sm text-[#4c5d73] transition-colors hover:text-[#0d1b2a] sm:py-0">For agencies</Link>
                <Link to="/resources" className="py-3 text-sm text-[#4c5d73] transition-colors hover:text-[#0d1b2a] sm:py-0">Resources</Link>
                <Link to="/blog" className="py-3 text-sm text-[#4c5d73] transition-colors hover:text-[#0d1b2a] sm:py-0">Blog</Link>
                <Link to="/login" className="py-3 text-sm text-[#4c5d73] transition-colors hover:text-[#0d1b2a] sm:py-0">Workspace sign-in</Link>
                <Link to="/portal/login" className="py-3 text-sm text-[#4c5d73] transition-colors hover:text-[#0d1b2a] sm:py-0">Client portal sign-in</Link>
              </nav>
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-4 border-t border-[#0d1b2a]/8 pt-6 md:flex-row md:items-center md:justify-between">
          <p className="text-sm text-[#5d7188]">
            &copy; {new Date().getFullYear()} Get On A Pod. All rights reserved.
          </p>
          <p className="text-sm text-[#5d7188]">
            Booked by hand, not by blast.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
