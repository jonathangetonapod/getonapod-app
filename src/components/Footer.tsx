import { Link } from 'react-router-dom';

const Footer = () => {
  return (
    <footer className="py-12 md:py-16 border-t border-border">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-10">
          <div>
            <div className="text-xl font-bold tracking-tight text-foreground mb-3">
              GET ON A POD
            </div>
            <p className="text-sm text-muted-foreground">
              Done-for-you podcast booking for founders and financial professionals.
            </p>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-foreground mb-3">Services</h4>
            <nav className="flex flex-col gap-2">
              <a href="/#pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Pricing</a>
              <Link to="/premium-placements" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Premium Placements</Link>
              <Link to="/what-to-expect" className="text-sm text-muted-foreground hover:text-foreground transition-colors">What to Expect</Link>
            </nav>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-foreground mb-3">Learn</h4>
            <nav className="flex flex-col gap-2">
              <a href="/#how-it-works" className="text-sm text-muted-foreground hover:text-foreground transition-colors">How It Works</a>
              <Link to="/blog" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Blog</Link>
              <Link to="/resources" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Resources</Link>
              <Link to="/course" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Course</Link>
              <a href="/#faq" className="text-sm text-muted-foreground hover:text-foreground transition-colors">FAQ</a>
            </nav>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-foreground mb-3">Get Started</h4>
            <nav className="flex flex-col gap-2">
              <a
                href="https://calendly.com/getonapodjg/30min/2026-01-12T13:00:00-05:00"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Book a Call
              </a>
            </nav>
          </div>
        </div>

        <div className="border-t border-border pt-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} Get On A Pod. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
