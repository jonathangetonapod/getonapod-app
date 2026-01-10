const Footer = () => {
  const links = [
    { href: '#how-it-works', label: 'How It Works' },
    { href: '#pricing', label: 'Pricing' },
    { href: '#faq', label: 'FAQ' },
    { href: 'https://calendly.com/getonapodjg/30min/2026-01-12T13:00:00-05:00', label: 'Book a Call' },
  ];

  return (
    <footer className="py-12 border-t border-border">
      <div className="container mx-auto">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="text-xl font-bold tracking-tight text-foreground">
            GET ON A POD
          </div>
          
          <nav className="flex flex-wrap items-center justify-center gap-6">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                {...(link.href.startsWith('http') && { target: '_blank', rel: 'noopener noreferrer' })}
              >
                {link.label}
              </a>
            ))}
          </nav>
          
          <p className="text-sm text-muted-foreground">
            &copy; 2025 Get On A Pod. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
